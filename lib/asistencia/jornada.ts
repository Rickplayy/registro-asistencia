/**
 * Límites de jornada semanal — reforma laboral (sección 2.1 del documento
 * maestro): reducción gradual de 48 h (2026) a 40 h (2030).
 *
 * Módulo puro (sin base de datos): alimenta la tarjeta de alertas del
 * dashboard y es testeable de forma aislada.
 */
import { horasDelDia, type RegistroDia } from "./reporte";

/** Horas máximas de jornada semanal según el año calendario. */
export function limiteSemanalHoras(fecha: string): number {
  const anio = Number(fecha.slice(0, 4));
  if (anio <= 2026) return 48;
  if (anio === 2027) return 46;
  if (anio === 2028) return 44;
  if (anio === 2029) return 42;
  return 40; // 2030 en adelante
}

/** Lunes de la semana a la que pertenece la fecha "YYYY-MM-DD". */
export function inicioDeSemana(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  const dia = d.getUTCDay(); // 0=domingo
  const retroceso = dia === 0 ? 6 : dia - 1;
  d.setUTCDate(d.getUTCDate() - retroceso);
  return d.toISOString().slice(0, 10);
}

export type AlertaJornada = {
  empleadoId: string;
  nombre: string;
  horasSemana: number;
  limite: number;
  /** 'cerca' = alcanzó el umbral de aviso; 'excedido' = superó el límite legal. */
  nivel: "cerca" | "excedido";
};

/** Umbral de aviso: % del límite al que se empieza a alertar (90%). */
export const UMBRAL_ALERTA = 0.9;

/**
 * Alertas de jornada de la semana en curso: empleados cuyas horas acumuladas
 * se acercan (≥90%) o exceden el límite del año. `registrosSemana` debe traer
 * SOLO registros de la semana que contiene a `hoy`.
 */
export function alertasJornada(
  empleados: { id: string; nombre: string }[],
  registrosSemana: RegistroDia[],
  hoy: string,
): AlertaJornada[] {
  const limite = limiteSemanalHoras(hoy);

  // Agrupa por empleado y por día para reusar el emparejador entrada→salida.
  const porEmpleado = new Map<string, Map<string, RegistroDia[]>>();
  for (const r of registrosSemana) {
    let dias = porEmpleado.get(r.empleado_id);
    if (!dias) porEmpleado.set(r.empleado_id, (dias = new Map()));
    let lista = dias.get(r.fecha);
    if (!lista) dias.set(r.fecha, (lista = []));
    lista.push(r);
  }

  const alertas: AlertaJornada[] = [];
  for (const emp of empleados) {
    const dias = porEmpleado.get(emp.id);
    if (!dias) continue;
    let horas = 0;
    for (const [, delDia] of dias) horas += horasDelDia(delDia);
    horas = Math.round(horas * 100) / 100;

    if (horas >= limite) {
      alertas.push({
        empleadoId: emp.id,
        nombre: emp.nombre,
        horasSemana: horas,
        limite,
        nivel: "excedido",
      });
    } else if (horas >= limite * UMBRAL_ALERTA) {
      alertas.push({
        empleadoId: emp.id,
        nombre: emp.nombre,
        horasSemana: horas,
        limite,
        nivel: "cerca",
      });
    }
  }

  // Primero los excedidos, luego por horas descendentes.
  return alertas.sort((a, b) =>
    a.nivel !== b.nivel
      ? a.nivel === "excedido"
        ? -1
        : 1
      : b.horasSemana - a.horasSemana,
  );
}
