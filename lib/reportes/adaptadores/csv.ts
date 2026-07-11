/** Adaptador CSV: UTF-8 con BOM para que Excel en español abra acentos bien. */
import type { AdaptadorExportacion, DocumentoReporte } from "../tipos";
import { textoCelda } from "../tipos";

function esc(valor: string): string {
  return /[",\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

export const adaptadorCsv: AdaptadorExportacion = {
  formato: "csv",
  extension: "csv",
  mimeType: "text/csv; charset=utf-8",

  async generar(doc: DocumentoReporte): Promise<Uint8Array> {
    const encabezado = doc.columnas.map((c) => esc(c.titulo)).join(",");
    const lineas = doc.filas.map((fila) =>
      doc.columnas.map((c) => esc(textoCelda(c, fila))).join(","),
    );
    const csv = "﻿" + [encabezado, ...lineas].join("\r\n");
    return new TextEncoder().encode(csv);
  },
};
