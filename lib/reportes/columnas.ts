/**
 * ÚNICA fuente de verdad de las columnas del reporte de asistencia.
 *
 * Cuando la STPS publique su formato definitivo (sección 2.1), las columnas
 * nuevas se agregan AQUÍ y aparecen automáticamente en la vista 8.5 y en
 * todos los formatos de exportación (CSV, Excel, PDF, …).
 */
import type { FilaReporte } from "@/lib/asistencia/reporte";
import type { ColumnaReporte, FilaDatos } from "./tipos";

export const COLUMNAS_ASISTENCIA: ColumnaReporte[] = [
  { clave: "nombre", titulo: "Empleado", ancho: 32, alineacion: "izquierda" },
  { clave: "puesto", titulo: "Puesto", ancho: 20, alineacion: "izquierda" },
  {
    clave: "diasTrabajados",
    titulo: "Días trabajados",
    ancho: 16,
    alineacion: "derecha",
  },
  { clave: "retardos", titulo: "Retardos", ancho: 12, alineacion: "derecha" },
  { clave: "faltas", titulo: "Faltas", ancho: 12, alineacion: "derecha" },
  {
    clave: "horasTotales",
    titulo: "Horas totales",
    ancho: 14,
    alineacion: "derecha",
    formatear: (v) => Number(v).toFixed(2),
  },
];

/** Convierte las filas calculadas del reporte al formato genérico de exportación. */
export function filasAsistencia(filas: FilaReporte[]): FilaDatos[] {
  return filas.map((f) => ({
    nombre: f.nombre,
    puesto: f.puesto || "—",
    diasTrabajados: f.diasTrabajados,
    retardos: f.retardos,
    faltas: f.faltas,
    horasTotales: f.horasTotales,
  }));
}
