/**
 * Consulta de la proyección de nómina (vista 8.6 y exportaciones).
 * Cliente de sesión: RLS acota todo a la empresa del usuario.
 */
import { createClient } from "@/lib/db/server";
import { fechaMx } from "@/lib/asistencia/fechas";
import type { RegistroDia } from "@/lib/asistencia/reporte";
import {
  calcularIncidencia,
  faltasUltimos30Dias,
  type BonoAplicable,
  type ConfigNomina,
  type FilaIncidencia,
} from "./calculo";

export type BonoPendiente = {
  bonoId: string;
  bonoNombre: string;
  empleadoId: string;
  empleadoNombre: string;
};

export type AlertaFaltas = {
  empleadoId: string;
  nombre: string;
  faltas30d: number;
  umbral: number;
};

export type Proyeccion = {
  filas: FilaIncidencia[];
  desde: string;
  hasta: string;
  config: ConfigNomina;
  /** Empleados sin salario capturado (no proyectables). */
  sinSalario: { empleadoId: string; nombre: string }[];
  /** Bonos que requieren aprobación y aún no la tienen para este periodo. */
  bonosPendientes: BonoPendiente[];
  /** Alerta de faltas 30d (sección 2.3): SOLO alerta, jamás acción automática. */
  alertasFaltas: AlertaFaltas[];
};

export const CONFIG_NOMINA_DEFAULT: ConfigNomina = {
  tope_descuento_pct: 30,
  minutos_tolerancia: 15,
  retardos_antes_de_falta: 0,
  faltas_alerta_30d: 3,
  aplica_prima_dominical: false,
  salario_minimo_diario: 315.04,
};

export async function obtenerProyeccion(
  desde: string,
  hasta: string,
): Promise<Proyeccion> {
  const supabase = await createClient();
  const hoy = fechaMx();

  // Ventana amplia para cubrir el periodo Y los últimos 30 días (alertas).
  const inicio30 = new Date(`${hoy}T00:00:00Z`);
  inicio30.setUTCDate(inicio30.getUTCDate() - 29);
  const desdeAmplio =
    inicio30.toISOString().slice(0, 10) < desde
      ? inicio30.toISOString().slice(0, 10)
      : desde;

  const [
    { data: empresa },
    { data: configRow },
    { data: empleados },
    { data: salarios },
    { data: registros },
    { data: bonos },
    { data: aprobaciones },
  ] = await Promise.all([
    supabase.from("empresas").select("hora_entrada").maybeSingle(),
    supabase.from("configuracion_nomina").select("*").maybeSingle(),
    supabase
      .from("empleados")
      .select("id, nombre")
      .eq("estatus", "activo")
      .order("nombre"),
    supabase
      .from("salarios")
      .select("empleado_id, tipo, monto, vigente_desde, vigente_hasta")
      .lte("vigente_desde", hasta)
      .order("vigente_desde", { ascending: false }),
    supabase
      .from("registros_asistencia")
      .select("empleado_id, fecha, hora, tipo")
      .gte("fecha", desdeAmplio)
      .lte("fecha", hasta > hoy ? hasta : hoy),
    supabase.from("bonos").select("*").eq("activo", true),
    supabase
      .from("bonos_aprobaciones")
      .select("bono_id, empleado_id")
      .eq("periodo_desde", desde)
      .eq("periodo_hasta", hasta),
  ]);

  const config: ConfigNomina = configRow
    ? {
        tope_descuento_pct: Number(configRow.tope_descuento_pct),
        minutos_tolerancia: configRow.minutos_tolerancia,
        retardos_antes_de_falta: configRow.retardos_antes_de_falta,
        faltas_alerta_30d: configRow.faltas_alerta_30d,
        aplica_prima_dominical: configRow.aplica_prima_dominical,
        salario_minimo_diario: Number(configRow.salario_minimo_diario),
      }
    : CONFIG_NOMINA_DEFAULT;

  // Salario vigente al FIN del periodo: la fila más reciente cuyo rango cubre.
  const salarioVigente = new Map<
    string,
    { tipo: "hora" | "dia"; monto: number }
  >();
  for (const s of salarios ?? []) {
    if (salarioVigente.has(s.empleado_id)) continue; // ya está el más reciente
    if (s.vigente_hasta && s.vigente_hasta < desde) continue;
    salarioVigente.set(s.empleado_id, {
      tipo: s.tipo,
      monto: Number(s.monto),
    });
  }

  const aprobadas = new Set(
    (aprobaciones ?? []).map((a) => `${a.bono_id}:${a.empleado_id}`),
  );

  const todos = (registros ?? []) as RegistroDia[];
  const delPeriodo = todos.filter((r) => r.fecha >= desde && r.fecha <= hasta);

  const filas: FilaIncidencia[] = [];
  const sinSalario: Proyeccion["sinSalario"] = [];
  const bonosPendientes: BonoPendiente[] = [];
  const alertasFaltas: AlertaFaltas[] = [];

  for (const emp of empleados ?? []) {
    const registrosEmp = delPeriodo.filter((r) => r.empleado_id === emp.id);
    const registrosEmp30 = todos.filter((r) => r.empleado_id === emp.id);

    // Alerta de faltas (independiente de si tiene salario)
    const faltas30 = faltasUltimos30Dias(registrosEmp30, hoy);
    if (faltas30 >= config.faltas_alerta_30d) {
      alertasFaltas.push({
        empleadoId: emp.id,
        nombre: emp.nombre,
        faltas30d: faltas30,
        umbral: config.faltas_alerta_30d,
      });
    }

    const salario = salarioVigente.get(emp.id);
    if (!salario) {
      sinSalario.push({ empleadoId: emp.id, nombre: emp.nombre });
      continue;
    }

    // Bonos aplicables: sin aprobación requerida, o ya aprobados para el periodo.
    const aplicables: BonoAplicable[] = [];
    for (const b of bonos ?? []) {
      if (b.requiere_aprobacion && !aprobadas.has(`${b.id}:${emp.id}`)) {
        bonosPendientes.push({
          bonoId: b.id,
          bonoNombre: b.nombre,
          empleadoId: emp.id,
          empleadoNombre: emp.nombre,
        });
        continue;
      }
      aplicables.push({
        id: b.id,
        nombre: b.nombre,
        tipo: b.tipo,
        monto_o_pct: Number(b.monto_o_pct),
        condicion: b.condicion,
      });
    }

    filas.push(
      calcularIncidencia({
        empleado: emp,
        salario,
        registros: registrosEmp,
        desde,
        hasta,
        hoy,
        horaEntrada: empresa?.hora_entrada ?? "09:00:00",
        config,
        bonos: aplicables,
      }),
    );
  }

  return {
    filas,
    desde,
    hasta,
    config,
    sinSalario,
    bonosPendientes,
    alertasFaltas,
  };
}
