/**
 * Cálculo puro de métricas de asistencia (dashboard y reportes).
 * Sin acceso a base de datos: recibe filas y regresa agregados — testeable.
 *
 * Definiciones del MVP (se refinan en Fases 4 y 6):
 *  - Presente: empleado con al menos una ENTRADA en el día.
 *  - Retardo: la PRIMERA entrada del día es posterior a hora_entrada +
 *    tolerancia de la empresa.
 *  - Falta: día hábil (L-V) sin ninguna entrada, para empleados activos.
 *  - Horas trabajadas: suma de pares entrada→salida del día, en orden.
 */
import { esDiaHabil, horasEntre, rangoFechas, sumarMinutos } from "./fechas";

export type RegistroDia = {
  empleado_id: string;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:MM:SS
  tipo: "entrada" | "salida";
};

export type JornadaEmpresa = {
  hora_entrada: string;
  tolerancia_retardo_minutos: number;
};

export type ResumenDia = {
  presentes: number;
  retardos: number;
  faltas: number;
  totalActivos: number;
};

/** ¿La primera entrada del día cuenta como retardo? */
export function esRetardo(
  primeraEntrada: string,
  jornada: JornadaEmpresa,
): boolean {
  const limite = sumarMinutos(
    jornada.hora_entrada,
    jornada.tolerancia_retardo_minutos,
  );
  return primeraEntrada > limite;
}

/** Primera entrada por empleado a partir de los registros de UN día. */
export function primerasEntradas(
  registros: RegistroDia[],
): Map<string, string> {
  const primeras = new Map<string, string>();
  for (const r of registros) {
    if (r.tipo !== "entrada") continue;
    const actual = primeras.get(r.empleado_id);
    if (!actual || r.hora < actual) primeras.set(r.empleado_id, r.hora);
  }
  return primeras;
}

/** Tarjetas del dashboard para los registros de UN día. */
export function resumenDelDia(
  registrosHoy: RegistroDia[],
  totalActivos: number,
  jornada: JornadaEmpresa,
): ResumenDia {
  const primeras = primerasEntradas(registrosHoy);
  let retardos = 0;
  for (const hora of primeras.values()) {
    if (esRetardo(hora, jornada)) retardos++;
  }
  return {
    presentes: primeras.size,
    retardos,
    faltas: Math.max(0, totalActivos - primeras.size),
    totalActivos,
  };
}

/** Horas trabajadas en un día: empareja entradas con salidas en orden. */
export function horasDelDia(registrosDia: RegistroDia[]): number {
  const orden = [...registrosDia].sort((a, b) => (a.hora < b.hora ? -1 : 1));
  let horas = 0;
  let entradaAbierta: string | null = null;
  for (const r of orden) {
    if (r.tipo === "entrada" && entradaAbierta === null) {
      entradaAbierta = r.hora;
    } else if (r.tipo === "salida" && entradaAbierta !== null) {
      horas += horasEntre(entradaAbierta, r.hora);
      entradaAbierta = null;
    }
  }
  return horas;
}

export type FilaReporte = {
  empleadoId: string;
  nombre: string;
  puesto: string;
  diasTrabajados: number;
  retardos: number;
  faltas: number;
  horasTotales: number; // horas decimales, redondeadas a 2
};

/**
 * Reporte por empleado en un rango de fechas (sección 8.5).
 * `hastaEfectivo` limita las faltas a días ya transcurridos.
 */
export function reporteAsistencia(
  empleados: { id: string; nombre: string; puesto: string | null }[],
  registros: RegistroDia[],
  desde: string,
  hasta: string,
  jornada: JornadaEmpresa,
  hoy: string,
): FilaReporte[] {
  const hastaEfectivo = hasta < hoy ? hasta : hoy;
  const diasHabiles = rangoFechas(desde, hastaEfectivo).filter(esDiaHabil);

  const porEmpleadoYDia = new Map<string, Map<string, RegistroDia[]>>();
  for (const r of registros) {
    let dias = porEmpleadoYDia.get(r.empleado_id);
    if (!dias) porEmpleadoYDia.set(r.empleado_id, (dias = new Map()));
    let lista = dias.get(r.fecha);
    if (!lista) dias.set(r.fecha, (lista = []));
    lista.push(r);
  }

  return empleados.map((emp) => {
    const dias =
      porEmpleadoYDia.get(emp.id) ?? new Map<string, RegistroDia[]>();
    let diasTrabajados = 0;
    let retardos = 0;
    let horasTotales = 0;

    for (const [, delDia] of dias) {
      const primeras = primerasEntradas(delDia);
      const primera = primeras.get(emp.id);
      if (!primera) continue;
      diasTrabajados++;
      if (esRetardo(primera, jornada)) retardos++;
      horasTotales += horasDelDia(delDia);
    }

    const faltas = diasHabiles.filter((f) => {
      const delDia = dias.get(f) ?? [];
      return !delDia.some((r: RegistroDia) => r.tipo === "entrada");
    }).length;

    return {
      empleadoId: emp.id,
      nombre: emp.nombre,
      puesto: emp.puesto ?? "",
      diasTrabajados,
      retardos,
      faltas,
      horasTotales: Math.round(horasTotales * 100) / 100,
    };
  });
}

/** CSV UTF-8 con BOM (para que Excel en español lo abra con acentos bien). */
export function reporteACsv(filas: FilaReporte[]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const encabezado =
    "Empleado,Puesto,Días trabajados,Retardos,Faltas,Horas totales";
  const lineas = filas.map((f) =>
    [f.nombre, f.puesto, f.diasTrabajados, f.retardos, f.faltas, f.horasTotales]
      .map(esc)
      .join(","),
  );
  return "﻿" + [encabezado, ...lineas].join("\r\n");
}
