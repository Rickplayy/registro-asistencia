/**
 * Exportación del reporte de asistencia (Fase 4 — cumplimiento STPS).
 *
 * El formato concreto lo resuelve el registro de adaptadores
 * (lib/reportes/adaptadores): agregar un formato nuevo NO toca esta ruta.
 *
 * REGLA INQUEBRANTABLE: ninguna exportación sin quedar en `auditoria`.
 * El registro se inserta ANTES de entregar el archivo y, si falla, la
 * exportación se aborta — el archivo nunca sale sin su evidencia.
 */
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/db/server";
import {
  fechaValida,
  inicioDeMes,
  obtenerReporte,
} from "@/lib/asistencia/consultas";
import { fechaMx } from "@/lib/asistencia/fechas";
import { COLUMNAS_ASISTENCIA, filasAsistencia } from "@/lib/reportes/columnas";
import { obtenerAdaptador } from "@/lib/reportes/adaptadores";

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

  const params = req.nextUrl.searchParams;
  const desde = fechaValida(params.get("desde")) ?? inicioDeMes();
  const hasta = fechaValida(params.get("hasta")) ?? fechaMx();
  const adaptador = obtenerAdaptador(params.get("formato") ?? "xlsx");
  if (!adaptador) {
    return NextResponse.json({ error: "Formato desconocido" }, { status: 400 });
  }

  const { filas, empresaNombre } = await obtenerReporte(desde, hasta);

  // Auditoría PRIMERO (quién exportó qué y cuándo). Si no se puede auditar,
  // no se entrega el archivo: la evidencia no es opcional.
  const { error: errAuditoria } = await supabase.from("auditoria").insert({
    usuario_admin_id: perfil.id,
    empresa_id: perfil.empresa_id,
    accion: "reporte.exportacion",
    entidad_afectada: "registros_asistencia",
    detalles: {
      formato: adaptador.formato,
      desde,
      hasta,
      empleados: filas.length,
    },
  });
  if (errAuditoria) {
    console.error(
      "[reportes] no se pudo auditar la exportación:",
      errAuditoria,
    );
    return NextResponse.json(
      { error: "No se pudo registrar la auditoría; exportación cancelada." },
      { status: 500 },
    );
  }

  const archivo = await adaptador.generar({
    titulo: "Reporte de asistencia",
    empresaNombre,
    periodo: { desde, hasta },
    columnas: COLUMNAS_ASISTENCIA,
    filas: filasAsistencia(filas),
    generadoPor: `${perfil.nombre} <${perfil.email}>`,
    generadoEn: new Date().toISOString(),
  });

  return new NextResponse(Buffer.from(archivo), {
    headers: {
      "Content-Type": adaptador.mimeType,
      "Content-Disposition": `attachment; filename="asistencia_${desde}_a_${hasta}.${adaptador.extension}"`,
    },
  });
}
