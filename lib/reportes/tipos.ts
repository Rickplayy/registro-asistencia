/**
 * Punto de extensión del módulo de reportes (Fase 4 — cumplimiento STPS).
 *
 * La STPS aún no publica el formato oficial completo del registro de jornada
 * (sección 2.1 del documento maestro): estos tipos existen para que, cuando
 * lo publique, ajustar el reporte sea (a) editar la lista de columnas y/o
 * (b) agregar un adaptador de formato — sin reescribir vista ni exportadores.
 */

export type ColumnaReporte = {
  /** Llave del dato dentro de cada fila. */
  clave: string;
  /** Encabezado visible (vista, Excel, PDF, CSV). */
  titulo: string;
  /** Ancho sugerido (caracteres en Excel; proporción en PDF). */
  ancho: number;
  alineacion: "izquierda" | "derecha";
  /** Formatea el valor crudo a texto (default: String). */
  formatear?: (valor: unknown) => string;
};

/** Una fila del reporte: valores crudos indexados por clave de columna. */
export type FilaDatos = Record<string, string | number>;

/** Documento listo para exportar: datos + contexto legal de trazabilidad. */
export type DocumentoReporte = {
  titulo: string;
  empresaNombre: string;
  periodo: { desde: string; hasta: string };
  columnas: ColumnaReporte[];
  filas: FilaDatos[];
  /** Quién y cuándo lo generó (va impreso en el documento: evidencia). */
  generadoPor: string;
  generadoEn: string; // ISO
};

/**
 * Contrato de un formato de exportación. Para soportar un formato nuevo
 * (p. ej. el layout XML/JSON que publique la STPS) se implementa esta
 * interfaz y se registra en `adaptadores/index.ts` — nada más.
 */
export interface AdaptadorExportacion {
  /** Identificador en la URL (?formato=...). */
  formato: string;
  extension: string;
  mimeType: string;
  generar(doc: DocumentoReporte): Promise<Uint8Array>;
}

/** Valor de una celda ya formateado como texto. */
export function textoCelda(col: ColumnaReporte, fila: FilaDatos): string {
  const crudo = fila[col.clave] ?? "";
  return col.formatear ? col.formatear(crudo) : String(crudo);
}
