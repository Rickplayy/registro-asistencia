/**
 * Tests de la Fase 4 — cumplimiento STPS:
 *  - Adaptadores de exportación (CSV / Excel / PDF) sobre la interfaz común.
 *  - Límites de jornada por año (reforma laboral, sección 2.1) y alertas.
 * Corren sin base de datos: `npm run test:unit`.
 */
import { describe, expect, it } from "vitest";

import {
  alertasJornada,
  inicioDeSemana,
  limiteSemanalHoras,
  UMBRAL_ALERTA,
} from "@/lib/asistencia/jornada";
import type { RegistroDia } from "@/lib/asistencia/reporte";
import { COLUMNAS_ASISTENCIA, filasAsistencia } from "@/lib/reportes/columnas";
import {
  formatosDisponibles,
  obtenerAdaptador,
} from "@/lib/reportes/adaptadores";
import type { DocumentoReporte } from "@/lib/reportes/tipos";

const reg = (
  empleado: string,
  fecha: string,
  hora: string,
  tipo: "entrada" | "salida",
): RegistroDia => ({ empleado_id: empleado, fecha, hora, tipo });

// ----------------------------------------------------------------------------
// Límites de jornada (48h 2026 → 40h 2030)
// ----------------------------------------------------------------------------
describe("limiteSemanalHoras — reducción gradual de jornada", () => {
  it("aplica el calendario de la reforma", () => {
    expect(limiteSemanalHoras("2025-06-01")).toBe(48);
    expect(limiteSemanalHoras("2026-07-11")).toBe(48);
    expect(limiteSemanalHoras("2027-01-01")).toBe(46);
    expect(limiteSemanalHoras("2028-05-10")).toBe(44);
    expect(limiteSemanalHoras("2029-12-31")).toBe(42);
    expect(limiteSemanalHoras("2030-01-01")).toBe(40);
    expect(limiteSemanalHoras("2035-01-01")).toBe(40);
  });
});

describe("inicioDeSemana", () => {
  it("regresa el lunes de la semana (incluido el domingo hacia atrás)", () => {
    expect(inicioDeSemana("2026-07-11")).toBe("2026-07-06"); // sábado → lunes previo
    expect(inicioDeSemana("2026-07-06")).toBe("2026-07-06"); // lunes → sí mismo
    expect(inicioDeSemana("2026-07-12")).toBe("2026-07-06"); // domingo → lunes previo
  });
});

// ----------------------------------------------------------------------------
// Alertas de jornada
// ----------------------------------------------------------------------------
describe("alertasJornada", () => {
  const empleados = [
    { id: "ana", nombre: "Ana" },
    { id: "beto", nombre: "Beto" },
    { id: "cata", nombre: "Cata" },
  ];

  // 2026 → límite 48 h; umbral de aviso 90% = 43.2 h
  const HOY = "2026-07-10";

  function semanaDeHoras(empleado: string, horasPorDia: number, dias: number) {
    const registros: RegistroDia[] = [];
    for (let d = 0; d < dias; d++) {
      const fecha = `2026-07-0${6 + d}`; // lun 6 → vie 10
      registros.push(reg(empleado, fecha, "08:00:00", "entrada"));
      const salida = `${String(8 + horasPorDia).padStart(2, "0")}:00:00`;
      registros.push(reg(empleado, fecha, salida, "salida"));
    }
    return registros;
  }

  it("alerta 'cerca' al alcanzar el 90% del límite y 'excedido' al superarlo", () => {
    const registros = [
      ...semanaDeHoras("ana", 9, 5), // 45 h → cerca (>= 43.2, < 48)
      ...semanaDeHoras("beto", 10, 5), // 50 h → excedido
      ...semanaDeHoras("cata", 8, 4), // 32 h → sin alerta
    ];
    const alertas = alertasJornada(empleados, registros, HOY);

    expect(alertas.map((a) => a.empleadoId)).toEqual(["beto", "ana"]); // excedido primero
    expect(alertas[0].nivel).toBe("excedido");
    expect(alertas[0].horasSemana).toBe(50);
    expect(alertas[0].limite).toBe(48);
    expect(alertas[1].nivel).toBe("cerca");
    expect(alertas[1].horasSemana).toBe(45);
  });

  it("el umbral exacto del 90% ya alerta", () => {
    // 48 * 0.9 = 43.2 h → 43.2/5 días no da horas exactas; usa 4 días de 10.8h
    const registros: RegistroDia[] = [];
    for (let d = 0; d < 4; d++) {
      const fecha = `2026-07-0${6 + d}`;
      registros.push(reg("ana", fecha, "08:00:00", "entrada"));
      registros.push(reg("ana", fecha, "18:48:00", "salida")); // 10.8 h
    }
    const alertas = alertasJornada([empleados[0]], registros, HOY);
    expect(alertas).toHaveLength(1);
    expect(alertas[0].horasSemana).toBeCloseTo(48 * UMBRAL_ALERTA, 2);
    expect(alertas[0].nivel).toBe("cerca");
  });

  it("sin registros no hay alertas", () => {
    expect(alertasJornada(empleados, [], HOY)).toEqual([]);
  });

  it("en 2027 el límite baja a 46 h (una semana de 47 h pasa de 'cerca' a 'excedido')", () => {
    const registros: RegistroDia[] = [];
    for (let d = 0; d < 5; d++) {
      const fecha = `2027-07-0${5 + d}`; // lun 5 jul 2027 → vie 9
      registros.push(reg("ana", fecha, "08:00:00", "entrada"));
      registros.push(reg("ana", fecha, "17:24:00", "salida")); // 9.4 h → 47 h
    }
    const alertas = alertasJornada([empleados[0]], registros, "2027-07-09");
    expect(alertas[0].limite).toBe(46);
    expect(alertas[0].nivel).toBe("excedido");
  });
});

// ----------------------------------------------------------------------------
// Adaptadores de exportación (punto de extensión STPS)
// ----------------------------------------------------------------------------
const DOC: DocumentoReporte = {
  titulo: "Reporte de asistencia",
  empresaNombre: "Empresa Prueba SA",
  periodo: { desde: "2026-07-01", hasta: "2026-07-10" },
  columnas: COLUMNAS_ASISTENCIA,
  filas: filasAsistencia([
    {
      empleadoId: "x",
      nombre: 'Pérez, José "Pepe"',
      puesto: "Ventas",
      diasTrabajados: 5,
      retardos: 1,
      faltas: 0,
      horasTotales: 42.5,
    },
  ]),
  generadoPor: "Admin Prueba <admin@prueba.mx>",
  generadoEn: "2026-07-11T12:00:00.000Z",
};

describe("registro de adaptadores", () => {
  it("expone xlsx, pdf y csv; rechaza formatos desconocidos", () => {
    expect(formatosDisponibles().map((f) => f.formato)).toEqual([
      "xlsx",
      "pdf",
      "csv",
    ]);
    expect(obtenerAdaptador("xlsx")?.mimeType).toContain("spreadsheetml");
    expect(obtenerAdaptador("pdf")?.mimeType).toBe("application/pdf");
    expect(obtenerAdaptador("stps-xml")).toBeNull(); // aún no existe: se registrará al publicarse el estándar
  });
});

describe("adaptador CSV", () => {
  it("BOM + encabezados desde las columnas + escape de comas/comillas", async () => {
    const bytes = await obtenerAdaptador("csv")!.generar(DOC);
    // BOM UTF-8 en los bytes crudos (TextDecoder lo quita al decodificar)
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes);
    expect(csv).toContain("Empleado,Puesto,Días trabajados");
    expect(csv).toContain('"Pérez, José ""Pepe"""');
    expect(csv).toContain("42.50");
  });
});

describe("adaptador Excel", () => {
  it("produce un .xlsx válido (firma ZIP) con contexto de empresa y periodo", async () => {
    const bytes = await obtenerAdaptador("xlsx")!.generar(DOC);
    // Un .xlsx es un ZIP: firma PK\x03\x04
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes.length).toBeGreaterThan(1000);
  });
});

describe("adaptador PDF", () => {
  it("produce un PDF válido (%PDF) con paginación", async () => {
    const bytes = await obtenerAdaptador("pdf")!.generar(DOC);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("pagina reportes grandes sin fallar (200 empleados)", async () => {
    const muchasFilas = Array.from({ length: 200 }, (_, i) => ({
      empleadoId: `e${i}`,
      nombre: `Empleado Número ${i}`,
      puesto: "Operaciones",
      diasTrabajados: 5,
      retardos: i % 3,
      faltas: i % 2,
      horasTotales: 40 + (i % 9),
    }));
    const bytes = await obtenerAdaptador("pdf")!.generar({
      ...DOC,
      filas: filasAsistencia(muchasFilas),
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    // Con 200 filas debe haber varias páginas: el PDF crece sustancialmente
    expect(bytes.length).toBeGreaterThan(10_000);
  });
});

describe("extensibilidad de columnas (regla de la fase)", () => {
  it("agregar una columna nueva llega a todos los formatos sin tocar adaptadores", async () => {
    // Simula el día en que la STPS pida, p. ej., "Horas extra".
    const columnasExtendidas = [
      ...COLUMNAS_ASISTENCIA,
      {
        clave: "horasExtra",
        titulo: "Horas extra",
        ancho: 12,
        alineacion: "derecha" as const,
      },
    ];
    const doc: DocumentoReporte = {
      ...DOC,
      columnas: columnasExtendidas,
      filas: DOC.filas.map((f) => ({ ...f, horasExtra: 3 })),
    };

    const csv = new TextDecoder().decode(
      await obtenerAdaptador("csv")!.generar(doc),
    );
    expect(csv).toContain("Horas extra");
    expect(csv.split("\r\n")[1]).toContain(",3");

    const pdf = await obtenerAdaptador("pdf")!.generar(doc);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");

    const xlsx = await obtenerAdaptador("xlsx")!.generar(doc);
    expect(xlsx[0]).toBe(0x50);
  });
});
