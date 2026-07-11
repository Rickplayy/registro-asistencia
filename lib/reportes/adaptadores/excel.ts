/** Adaptador Excel (.xlsx) con encabezado de contexto legal (empresa/periodo). */
import type { AdaptadorExportacion, DocumentoReporte } from "../tipos";

export const adaptadorExcel: AdaptadorExportacion = {
  formato: "xlsx",
  extension: "xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  async generar(doc: DocumentoReporte): Promise<Uint8Array> {
    // Import dinámico: exceljs solo se carga cuando alguien exporta.
    const ExcelJS = (await import("exceljs")).default;
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet("Asistencia");

    // Contexto (trazabilidad del documento como evidencia)
    hoja.addRow([doc.titulo]);
    hoja.addRow([doc.empresaNombre]);
    hoja.addRow([`Periodo: ${doc.periodo.desde} a ${doc.periodo.hasta}`]);
    hoja.addRow([
      `Generado por ${doc.generadoPor} el ${new Date(doc.generadoEn).toLocaleString("es-MX")}`,
    ]);
    hoja.addRow([]);
    hoja.getRow(1).font = { bold: true, size: 14 };

    // Encabezados + datos desde la definición única de columnas
    const filaEncabezado = hoja.addRow(doc.columnas.map((c) => c.titulo));
    filaEncabezado.font = { bold: true };
    doc.columnas.forEach((c, i) => {
      hoja.getColumn(i + 1).width = c.ancho;
      if (c.alineacion === "derecha") {
        hoja.getColumn(i + 1).alignment = { horizontal: "right" };
      }
    });
    // El título/contexto no debe heredar la alineación de la columna 1
    for (let r = 1; r <= 4; r++) {
      hoja.getRow(r).alignment = { horizontal: "left" };
    }

    for (const fila of doc.filas) {
      hoja.addRow(doc.columnas.map((c) => fila[c.clave] ?? ""));
    }

    const buffer = await libro.xlsx.writeBuffer();
    return new Uint8Array(buffer as ArrayBuffer);
  },
};
