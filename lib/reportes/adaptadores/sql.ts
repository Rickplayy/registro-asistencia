/**
 * Adaptador SQL (Fase 6): script de INSERTs sobre la tabla `incidencias` del
 * periodo, para integraciones directas o para que el equipo de sistemas de un
 * cliente grande lo cargue a su propio almacén (sección 11.3).
 *
 * Espera filas con las claves numéricas de la proyección de nómina
 * (filasNomina) más `empleadoId`; el periodo va en doc.periodo.
 */
import type { AdaptadorExportacion, DocumentoReporte } from "../tipos";

const esc = (v: string) => v.replace(/'/g, "''");

export const adaptadorSqlIncidencias: AdaptadorExportacion = {
  formato: "sql",
  extension: "sql",
  mimeType: "application/sql; charset=utf-8",

  async generar(doc: DocumentoReporte): Promise<Uint8Array> {
    const lineas: string[] = [
      `-- Incidencias del periodo ${doc.periodo.desde} a ${doc.periodo.hasta}`,
      `-- ${esc(doc.empresaNombre)} · Generado por ${esc(doc.generadoPor)} el ${doc.generadoEn}`,
      `-- Proyección para revisión: NO es un pago ni un timbrado (sección 11.1).`,
      "begin;",
    ];

    for (const fila of doc.filas) {
      const num = (clave: string) => Number(fila[clave] ?? 0);
      lineas.push(
        "insert into incidencias (empleado_id, periodo_desde, periodo_hasta, " +
          "horas_trabajadas, horas_extra_dobles, horas_extra_triples, retardos, " +
          "faltas, descuento_calculado, bonos_aplicados, total_proyectado) values (" +
          [
            `'${esc(String(fila.empleadoId ?? ""))}'`,
            `'${doc.periodo.desde}'`,
            `'${doc.periodo.hasta}'`,
            num("horasTrabajadas"),
            num("horasExtraDobles"),
            num("horasExtraTriples"),
            num("retardos"),
            num("faltas"),
            num("descuentoCalculado"),
            num("bonosAplicados"),
            num("totalProyectado"),
          ].join(", ") +
          ");",
      );
    }

    lineas.push("commit;");
    return new TextEncoder().encode(lineas.join("\n"));
  },
};
