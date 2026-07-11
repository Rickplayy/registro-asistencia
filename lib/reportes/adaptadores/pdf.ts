/**
 * Adaptador PDF (pdf-lib, JS puro: sin binarios nativos ni archivos de
 * fuentes). Tabla paginada en carta horizontal con encabezado repetido y
 * pie de trazabilidad (quién generó, cuándo, página N de M).
 */
import type { AdaptadorExportacion, DocumentoReporte } from "../tipos";
import { textoCelda } from "../tipos";

// Carta horizontal (points)
const PAGINA = { ancho: 792, alto: 612 };
const MARGEN = 40;
const ALTO_FILA = 18;
const TAMANO_TEXTO = 9;
const TAMANO_TITULO = 14;

export const adaptadorPdf: AdaptadorExportacion = {
  formato: "pdf",
  extension: "pdf",
  mimeType: "application/pdf",

  async generar(doc: DocumentoReporte): Promise<Uint8Array> {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const fuente = await pdf.embedFont(StandardFonts.Helvetica);
    const fuenteBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const anchoUtil = PAGINA.ancho - MARGEN * 2;
    const totalAnchos = doc.columnas.reduce((s, c) => s + c.ancho, 0);
    const anchos = doc.columnas.map((c) => (c.ancho / totalAnchos) * anchoUtil);

    const gris = rgb(0.45, 0.49, 0.55);
    const negro = rgb(0.12, 0.16, 0.22);
    const azul = rgb(0.12, 0.23, 0.37); // #1E3A5F — paleta sección 7

    // Recorta el texto para que quepa en su celda (sin desbordes).
    const ajustar = (texto: string, ancho: number, tam: number): string => {
      let t = texto;
      while (t.length > 1 && fuente.widthOfTextAtSize(t, tam) > ancho - 6) {
        t = t.slice(0, -2) + "…";
      }
      return t;
    };

    let pagina = pdf.addPage([PAGINA.ancho, PAGINA.alto]);
    let y = PAGINA.alto - MARGEN;

    const dibujarEncabezadoDocumento = () => {
      pagina.drawText(doc.titulo, {
        x: MARGEN,
        y,
        size: TAMANO_TITULO,
        font: fuenteBold,
        color: azul,
      });
      y -= 18;
      pagina.drawText(
        `${doc.empresaNombre} · Periodo: ${doc.periodo.desde} a ${doc.periodo.hasta}`,
        { x: MARGEN, y, size: 10, font: fuente, color: gris },
      );
      y -= 24;
    };

    const dibujarEncabezadoTabla = () => {
      pagina.drawRectangle({
        x: MARGEN,
        y: y - 4,
        width: anchoUtil,
        height: ALTO_FILA,
        color: azul,
      });
      let x = MARGEN;
      doc.columnas.forEach((c, i) => {
        const texto = ajustar(c.titulo, anchos[i], TAMANO_TEXTO);
        const anchoTexto = fuenteBold.widthOfTextAtSize(texto, TAMANO_TEXTO);
        pagina.drawText(texto, {
          x:
            c.alineacion === "derecha" ? x + anchos[i] - anchoTexto - 4 : x + 4,
          y: y + 1,
          size: TAMANO_TEXTO,
          font: fuenteBold,
          color: rgb(1, 1, 1),
        });
        x += anchos[i];
      });
      y -= ALTO_FILA;
    };

    const nuevaPagina = () => {
      pagina = pdf.addPage([PAGINA.ancho, PAGINA.alto]);
      y = PAGINA.alto - MARGEN;
      dibujarEncabezadoTabla();
    };

    dibujarEncabezadoDocumento();
    dibujarEncabezadoTabla();

    doc.filas.forEach((fila, idx) => {
      if (y < MARGEN + ALTO_FILA + 16) nuevaPagina();
      if (idx % 2 === 1) {
        pagina.drawRectangle({
          x: MARGEN,
          y: y - 4,
          width: anchoUtil,
          height: ALTO_FILA,
          color: rgb(0.95, 0.96, 0.97),
        });
      }
      let x = MARGEN;
      doc.columnas.forEach((c, i) => {
        const texto = ajustar(textoCelda(c, fila), anchos[i], TAMANO_TEXTO);
        const anchoTexto = fuente.widthOfTextAtSize(texto, TAMANO_TEXTO);
        pagina.drawText(texto, {
          x:
            c.alineacion === "derecha" ? x + anchos[i] - anchoTexto - 4 : x + 4,
          y: y + 1,
          size: TAMANO_TEXTO,
          font: fuente,
          color: negro,
        });
        x += anchos[i];
      });
      y -= ALTO_FILA;
    });

    // Pie de trazabilidad en todas las páginas (evidencia: quién y cuándo)
    const paginas = pdf.getPages();
    const pie = `Generado por ${doc.generadoPor} el ${new Date(doc.generadoEn).toLocaleString("es-MX")} · Registro electrónico de jornada`;
    paginas.forEach((p, i) => {
      p.drawText(pie, {
        x: MARGEN,
        y: MARGEN - 18,
        size: 8,
        font: fuente,
        color: gris,
      });
      const numeracion = `Página ${i + 1} de ${paginas.length}`;
      p.drawText(numeracion, {
        x: PAGINA.ancho - MARGEN - fuente.widthOfTextAtSize(numeracion, 8),
        y: MARGEN - 18,
        size: 8,
        font: fuente,
        color: gris,
      });
    });

    return pdf.save();
  },
};
