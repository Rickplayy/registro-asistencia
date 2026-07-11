/**
 * Registro de adaptadores de exportación (punto de extensión STPS).
 *
 * Para dar de alta un formato nuevo: implementa AdaptadorExportacion en un
 * archivo de esta carpeta y agrégalo a la lista. La ruta de exportación y la
 * vista de reportes lo descubren solos.
 */
import type { AdaptadorExportacion } from "../tipos";
import { adaptadorCsv } from "./csv";
import { adaptadorExcel } from "./excel";
import { adaptadorPdf } from "./pdf";

const ADAPTADORES: AdaptadorExportacion[] = [
  adaptadorExcel,
  adaptadorPdf,
  adaptadorCsv,
];

export function obtenerAdaptador(formato: string): AdaptadorExportacion | null {
  return ADAPTADORES.find((a) => a.formato === formato) ?? null;
}

/** Formatos disponibles, en el orden en que se ofrecen en la vista. */
export function formatosDisponibles(): { formato: string; etiqueta: string }[] {
  const etiquetas: Record<string, string> = {
    xlsx: "Excel",
    pdf: "PDF",
    csv: "CSV",
  };
  return ADAPTADORES.map((a) => ({
    formato: a.formato,
    etiqueta: etiquetas[a.formato] ?? a.formato.toUpperCase(),
  }));
}
