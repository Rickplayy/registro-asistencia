/**
 * Exportación de la proyección de nómina (Fase 6): Excel, CSV o SQL.
 *
 * REGLAS:
 *  - Los botones de exportar viven ÚNICAMENTE en la vista de proyección 8.6:
 *    la revisión humana ocurre antes de llegar aquí, y queda auditado QUIÉN
 *    exportó QUÉ periodo. Nada se marca como "pagado": esto es un insumo.
 *  - Auditoría PRIMERO; si falla, no se entrega el archivo (regla Fase 4).
 *  - Al exportar se materializa la tabla `incidencias` del periodo (upsert),
 *    que es exactamente lo que reproduce el script SQL.
 */
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/db/server";
import { fechaValida, inicioDeMes } from "@/lib/asistencia/consultas";
import { fechaMx } from "@/lib/asistencia/fechas";
import { obtenerProyeccion } from "@/lib/nomina/consultas";
import { COLUMNAS_NOMINA, filasNomina } from "@/lib/nomina/columnas";
import { obtenerAdaptador } from "@/lib/reportes/adaptadores";
import { adaptadorSqlIncidencias } from "@/lib/reportes/adaptadores/sql";
import { obtenerPlan } from "@/lib/planes";

/** Formatos de nómina (sección 11.3): Excel revisión, CSV nómina, SQL integración. */
const FORMATOS_NOMINA = ["xlsx", "csv", "sql"];

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { data: perfil } = await supabase
    .from("usuarios_admin")
    .select("id, empresa_id, nombre, email")
    .eq("auth_user_id", user.id)
    .eq("activo", true)
    .maybeSingle();
  if (!perfil?.empresa_id) {
    return NextResponse.json({ error: "Perfil sin empresa" }, { status: 403 });
  }

  const { data: empresa } = await supabase
    .from("empresas")
    .select("nombre, plan")
    .maybeSingle();
  if (!obtenerPlan(empresa?.plan).nomina) {
    return NextResponse.json(
      { error: "La proyección de nómina requiere plan Pro o Enterprise." },
      { status: 403 },
    );
  }

  const params = req.nextUrl.searchParams;
  const desde = fechaValida(params.get("desde")) ?? inicioDeMes();
  const hasta = fechaValida(params.get("hasta")) ?? fechaMx();
  const formato = params.get("formato") ?? "xlsx";
  if (!FORMATOS_NOMINA.includes(formato)) {
    return NextResponse.json(
      { error: "Formato desconocido (xlsx, csv o sql)." },
      { status: 400 },
    );
  }
  const adaptador =
    formato === "sql" ? adaptadorSqlIncidencias : obtenerAdaptador(formato)!;

  const proyeccion = await obtenerProyeccion(desde, hasta);

  // Auditoría PRIMERO: sin evidencia no hay archivo.
  const { error: errAuditoria } = await supabase.from("auditoria").insert({
    usuario_admin_id: perfil.id,
    empresa_id: perfil.empresa_id,
    accion: "nomina.exportacion",
    entidad_afectada: "incidencias",
    detalles: {
      formato,
      desde,
      hasta,
      empleados: proyeccion.filas.length,
      sin_salario: proyeccion.sinSalario.length,
    },
  });
  if (errAuditoria) {
    return NextResponse.json(
      { error: "No se pudo registrar la auditoría; exportación cancelada." },
      { status: 500 },
    );
  }

  // Materializar incidencias del periodo (lo que reproducirá el script SQL).
  if (proyeccion.filas.length > 0) {
    const { error: errIncidencias } = await supabase.from("incidencias").upsert(
      proyeccion.filas.map((f) => ({
        empresa_id: perfil.empresa_id,
        empleado_id: f.empleadoId,
        periodo_desde: desde,
        periodo_hasta: hasta,
        horas_trabajadas: f.horasTrabajadas,
        horas_extra_dobles: f.horasExtraDobles,
        horas_extra_triples: f.horasExtraTriples,
        retardos: f.retardos,
        faltas: f.faltas,
        descuento_calculado: f.descuentoCalculado,
        bonos_aplicados: f.bonosAplicados,
        total_proyectado: f.totalProyectado,
        generado_por: perfil.id,
      })),
      { onConflict: "empleado_id,periodo_desde,periodo_hasta" },
    );
    if (errIncidencias) {
      console.error(
        "[nomina] no se pudieron materializar incidencias:",
        errIncidencias,
      );
    }
  }

  const archivo = await adaptador.generar({
    titulo: "Proyección de nómina / incidencias",
    empresaNombre: empresa?.nombre ?? "",
    periodo: { desde, hasta },
    columnas: COLUMNAS_NOMINA,
    filas: filasNomina(proyeccion.filas),
    generadoPor: `${perfil.nombre} <${perfil.email}>`,
    generadoEn: new Date().toISOString(),
  });

  return new NextResponse(Buffer.from(archivo), {
    headers: {
      "Content-Type": adaptador.mimeType,
      "Content-Disposition": `attachment; filename="nomina_${desde}_a_${hasta}.${adaptador.extension}"`,
    },
  });
}
