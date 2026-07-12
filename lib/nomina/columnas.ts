/**
 * Columnas de la proyección de nómina (vista 8.6 y exportaciones Excel/CSV).
 * Mismo patrón que el reporte de asistencia: una sola fuente de verdad.
 */
import type { ColumnaReporte, FilaDatos } from "@/lib/reportes/tipos";
import type { FilaIncidencia } from "./calculo";

const dinero = (v: unknown) =>
  Number(v).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const COLUMNAS_NOMINA: ColumnaReporte[] = [
  { clave: "nombre", titulo: "Empleado", ancho: 28, alineacion: "izquierda" },
  { clave: "salario", titulo: "Salario", ancho: 14, alineacion: "derecha" },
  {
    clave: "horasTrabajadas",
    titulo: "Horas",
    ancho: 10,
    alineacion: "derecha",
    formatear: (v) => Number(v).toFixed(2),
  },
  {
    clave: "horasExtraDobles",
    titulo: "Extra 2x",
    ancho: 10,
    alineacion: "derecha",
    formatear: (v) => Number(v).toFixed(2),
  },
  {
    clave: "horasExtraTriples",
    titulo: "Extra 3x",
    ancho: 10,
    alineacion: "derecha",
    formatear: (v) => Number(v).toFixed(2),
  },
  { clave: "retardos", titulo: "Retardos", ancho: 10, alineacion: "derecha" },
  { clave: "faltas", titulo: "Faltas", ancho: 9, alineacion: "derecha" },
  {
    clave: "descuentoCalculado",
    titulo: "Descuento",
    ancho: 12,
    alineacion: "derecha",
    formatear: dinero,
  },
  {
    clave: "bonosAplicados",
    titulo: "Bonos",
    ancho: 12,
    alineacion: "derecha",
    formatear: dinero,
  },
  {
    clave: "totalProyectado",
    titulo: "Total proyectado",
    ancho: 16,
    alineacion: "derecha",
    formatear: dinero,
  },
];

/** Filas para vista/Excel/CSV; incluye claves extra que usa el adaptador SQL. */
export function filasNomina(filas: FilaIncidencia[]): FilaDatos[] {
  return filas.map((f) => ({
    empleadoId: f.empleadoId,
    nombre: f.nombre,
    salario: `$${f.salarioMonto.toFixed(2)}/${f.tipoSalario === "hora" ? "h" : "día"}`,
    horasTrabajadas: f.horasTrabajadas,
    horasExtraDobles: f.horasExtraDobles,
    horasExtraTriples: f.horasExtraTriples,
    retardos: f.retardos,
    faltas: f.faltas,
    descuentoCalculado: f.descuentoCalculado,
    bonosAplicados: f.bonosAplicados,
    totalProyectado: f.totalProyectado,
  }));
}
