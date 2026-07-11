/** Tests del cálculo de métricas de asistencia (dashboard y reportes). */
import { describe, expect, it } from "vitest";

import {
  esDiaHabil,
  horasEntre,
  rangoFechas,
  sumarMinutos,
} from "@/lib/asistencia/fechas";
import {
  esRetardo,
  horasDelDia,
  reporteAsistencia,
  resumenDelDia,
  type RegistroDia,
} from "@/lib/asistencia/reporte";

const JORNADA = { hora_entrada: "09:00:00", tolerancia_retardo_minutos: 15 };

const reg = (
  empleado: string,
  fecha: string,
  hora: string,
  tipo: "entrada" | "salida",
): RegistroDia => ({ empleado_id: empleado, fecha, hora, tipo });

describe("utilidades de fechas", () => {
  it("suma minutos con acarreo de hora", () => {
    expect(sumarMinutos("09:00", 15)).toBe("09:15:00");
    expect(sumarMinutos("09:50:00", 15)).toBe("10:05:00");
  });

  it("calcula horas decimales entre dos horas", () => {
    expect(horasEntre("09:00:00", "18:00:00")).toBe(9);
    expect(horasEntre("09:30:00", "10:00:00")).toBe(0.5);
    expect(horasEntre("18:00:00", "09:00:00")).toBe(0); // nunca negativo
  });

  it("genera rangos de fechas y detecta días hábiles", () => {
    expect(rangoFechas("2026-07-06", "2026-07-08")).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
    ]);
    expect(esDiaHabil("2026-07-06")).toBe(true); // lunes
    expect(esDiaHabil("2026-07-11")).toBe(false); // sábado
  });
});

describe("retardos", () => {
  it("dentro de la tolerancia NO es retardo", () => {
    expect(esRetardo("09:14:59", JORNADA)).toBe(false);
    expect(esRetardo("09:15:00", JORNADA)).toBe(false);
  });

  it("después de la tolerancia SÍ es retardo", () => {
    expect(esRetardo("09:15:01", JORNADA)).toBe(true);
    expect(esRetardo("10:30:00", JORNADA)).toBe(true);
  });
});

describe("resumen del día (tarjetas del dashboard)", () => {
  it("cuenta presentes, retardos y faltas", () => {
    const registros = [
      reg("ana", "2026-07-10", "08:55:00", "entrada"),
      reg("beto", "2026-07-10", "09:40:00", "entrada"),
      reg("ana", "2026-07-10", "13:00:00", "salida"),
    ];
    const r = resumenDelDia(registros, 5, JORNADA);
    expect(r.presentes).toBe(2);
    expect(r.retardos).toBe(1); // beto
    expect(r.faltas).toBe(3); // 5 activos - 2 presentes
  });

  it("usa la PRIMERA entrada para decidir retardo", () => {
    const registros = [
      reg("ana", "2026-07-10", "08:50:00", "entrada"),
      reg("ana", "2026-07-10", "14:00:00", "entrada"), // regreso de comida
    ];
    expect(resumenDelDia(registros, 1, JORNADA).retardos).toBe(0);
  });
});

describe("horas trabajadas", () => {
  it("empareja entrada→salida en orden", () => {
    const dia = [
      reg("ana", "2026-07-10", "09:00:00", "entrada"),
      reg("ana", "2026-07-10", "13:00:00", "salida"),
      reg("ana", "2026-07-10", "14:00:00", "entrada"),
      reg("ana", "2026-07-10", "18:00:00", "salida"),
    ];
    expect(horasDelDia(dia)).toBe(8);
  });

  it("ignora una salida sin entrada previa y una entrada sin salida", () => {
    expect(horasDelDia([reg("a", "2026-07-10", "18:00:00", "salida")])).toBe(0);
    expect(horasDelDia([reg("a", "2026-07-10", "09:00:00", "entrada")])).toBe(
      0,
    );
  });
});

describe("reporte por empleado (vista 8.5)", () => {
  const empleados = [
    { id: "ana", nombre: "Ana", puesto: "Ventas" },
    { id: "beto", nombre: "Beto", puesto: null },
  ];
  // Semana lun 6 a vie 10 de julio 2026
  const registros = [
    reg("ana", "2026-07-06", "08:58:00", "entrada"),
    reg("ana", "2026-07-06", "18:00:00", "salida"),
    reg("ana", "2026-07-07", "09:20:00", "entrada"), // retardo
    reg("ana", "2026-07-07", "18:00:00", "salida"),
    reg("beto", "2026-07-06", "09:00:00", "entrada"),
    reg("beto", "2026-07-06", "17:00:00", "salida"),
  ];

  it("agrega días, retardos, faltas y horas por empleado", () => {
    const filas = reporteAsistencia(
      empleados,
      registros,
      "2026-07-06",
      "2026-07-10",
      JORNADA,
      "2026-07-10", // hoy = viernes
    );
    const ana = filas.find((f) => f.empleadoId === "ana")!;
    expect(ana.diasTrabajados).toBe(2);
    expect(ana.retardos).toBe(1);
    expect(ana.faltas).toBe(3); // mié, jue, vie
    expect(ana.horasTotales).toBeCloseTo(9.02 + 8.67, 1);

    const beto = filas.find((f) => f.empleadoId === "beto")!;
    expect(beto.diasTrabajados).toBe(1);
    expect(beto.faltas).toBe(4);
    expect(beto.horasTotales).toBe(8);
  });

  it("no cuenta faltas de días futuros", () => {
    const filas = reporteAsistencia(
      empleados,
      registros,
      "2026-07-06",
      "2026-07-10",
      JORNADA,
      "2026-07-07", // hoy = martes: solo lun y mar cuentan
    );
    const beto = filas.find((f) => f.empleadoId === "beto")!;
    expect(beto.faltas).toBe(1); // solo el martes
  });
});
