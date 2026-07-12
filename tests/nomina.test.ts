/**
 * Tests del motor de incidencias (Fase 6) — validan las REGLAS LEGALES de la
 * sección 2.3 del documento maestro, incluidos los 4 casos obligatorios del
 * criterio de fase. Corren sin base de datos: `npm run test:unit`.
 */
import { describe, expect, it } from "vitest";

import {
  calcularIncidencia,
  faltasUltimos30Dias,
  salarioDiarioDe,
  salarioPorHoraDe,
  type BonoAplicable,
  type ConfigNomina,
} from "@/lib/nomina/calculo";
import type { RegistroDia } from "@/lib/asistencia/reporte";

const CONFIG: ConfigNomina = {
  tope_descuento_pct: 30,
  minutos_tolerancia: 15,
  retardos_antes_de_falta: 0,
  faltas_alerta_30d: 3,
  aplica_prima_dominical: false,
  salario_minimo_diario: 315.04,
};

const reg = (
  fecha: string,
  hora: string,
  tipo: "entrada" | "salida",
): RegistroDia => ({ empleado_id: "e1", fecha, hora, tipo });

/** Semana laboral completa (lun 6 – vie 10 jul 2026) de `horas` por día. */
function semana(horasPorDia: number, dias = 5): RegistroDia[] {
  const registros: RegistroDia[] = [];
  for (let d = 0; d < dias; d++) {
    const fecha = `2026-07-${String(6 + d).padStart(2, "0")}`;
    registros.push(reg(fecha, "08:00:00", "entrada"));
    const totalMin = Math.round(horasPorDia * 60);
    const h = 8 + Math.floor(totalMin / 60);
    const m = totalMin % 60;
    registros.push(
      reg(
        fecha,
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`,
        "salida",
      ),
    );
  }
  return registros;
}

function calcular(
  registros: RegistroDia[],
  extra: Partial<Parameters<typeof calcularIncidencia>[0]> = {},
) {
  return calcularIncidencia({
    empleado: { id: "e1", nombre: "Ana" },
    salario: { tipo: "dia", monto: 600 },
    registros,
    desde: "2026-07-06",
    hasta: "2026-07-10",
    hoy: "2026-07-10",
    horaEntrada: "08:00:00",
    config: CONFIG,
    bonos: [],
    ...extra,
  });
}

describe("conversión de salario", () => {
  it("hora↔día con jornada de 8 h", () => {
    expect(salarioDiarioDe({ tipo: "dia", monto: 600 })).toBe(600);
    expect(salarioDiarioDe({ tipo: "hora", monto: 75 })).toBe(600);
    expect(salarioPorHoraDe({ tipo: "dia", monto: 600 })).toBe(75);
    expect(salarioPorHoraDe({ tipo: "hora", monto: 75 })).toBe(75);
  });
});

// =============================================================================
// CASO OBLIGATORIO 1: salario en el mínimo → descuento debe ser $0
// =============================================================================
describe("CRITERIO 1 — salario mínimo: descuento $0", () => {
  it("con salario igual al mínimo, aun con faltas, el descuento es $0", () => {
    // Trabajó solo 3 de 5 días (2 faltas) ganando exactamente el mínimo
    const registros = semana(8, 3);
    const fila = calcular(registros, {
      salario: { tipo: "dia", monto: CONFIG.salario_minimo_diario },
    });
    expect(fila.faltas).toBe(2);
    expect(fila.descuentoCalculado).toBe(0); // excedente sobre el mínimo = 0
    // Y el total del periodo jamás queda por debajo del mínimo
    expect(fila.totalProyectado).toBeGreaterThanOrEqual(
      CONFIG.salario_minimo_diario * 5,
    );
  });
});

// =============================================================================
// CASO OBLIGATORIO 2: descuento que intentaría superar el 30% → debe topar
// =============================================================================
describe("CRITERIO 2 — tope del 30% del excedente sobre el mínimo", () => {
  it("un descuento bruto enorme topa exactamente en el 30% del excedente", () => {
    // 4 faltas de 5 días con salario alto: bruto = 4*1000 + séptimo ≫ tope
    const registros = semana(8, 1); // solo trabajó el lunes
    const fila = calcular(registros, { salario: { tipo: "dia", monto: 1000 } });
    expect(fila.faltas).toBe(4);

    const pagoBase = 1000 * 5;
    const minimoPeriodo = CONFIG.salario_minimo_diario * 5;
    const topeEsperado =
      Math.round((pagoBase - minimoPeriodo) * 0.3 * 100) / 100;
    expect(fila.descuentoCalculado).toBe(topeEsperado);
    // nunca por debajo del mínimo
    expect(fila.pagoBase - fila.descuentoCalculado).toBeGreaterThanOrEqual(
      minimoPeriodo,
    );
  });

  it("la empresa puede configurar un tope MENOR al 30, jamás mayor", () => {
    const registros = semana(8, 1);
    const con15 = calcular(registros, {
      salario: { tipo: "dia", monto: 1000 },
      config: { ...CONFIG, tope_descuento_pct: 15 },
    });
    const excedente = 1000 * 5 - CONFIG.salario_minimo_diario * 5;
    expect(con15.descuentoCalculado).toBeCloseTo(excedente * 0.15, 2);

    // Un 45 configurado (p. ej. datos corruptos) topa en el 30 legal
    const con45 = calcular(registros, {
      salario: { tipo: "dia", monto: 1000 },
      config: { ...CONFIG, tope_descuento_pct: 45 },
    });
    expect(con45.descuentoCalculado).toBeCloseTo(excedente * 0.3, 2);
  });
});

// =============================================================================
// CASO OBLIGATORIO 3: falta que rompe el ciclo de 6 días → resta séptimo día
// =============================================================================
describe("CRITERIO 3 — séptimo día proporcional (Art. 69 LFT)", () => {
  it("una falta descuenta su día MÁS 1/6 del séptimo día", () => {
    // 4 de 5 días trabajados, salario moderado para no chocar con el tope
    const registros = semana(8, 4); // falta el viernes... espera: semana(8,4) = lun-jue trabajados, vie falta
    const fila = calcular(registros, { salario: { tipo: "dia", monto: 400 } });
    expect(fila.faltas).toBe(1);

    // Bruto esperado: 1 día (400) + séptimo proporcional (400/6 = 66.67)
    const brutoEsperado = 400 + 400 / 6;
    const excedente = 400 * 5 - CONFIG.salario_minimo_diario * 5;
    // Con salario 400: excedente*0.3 = (2000-1575.2)*0.3 = 127.44 < bruto →
    // topa. Para OBSERVAR el séptimo día sin tope, sube el tope artificialmente
    // comparando contra un salario mayor:
    expect(fila.descuentoCalculado).toBeCloseTo(
      Math.min(brutoEsperado, excedente * 0.3),
      2,
    );
  });

  it("sin tope de por medio, el descuento incluye exactamente el séptimo día", () => {
    // Salario alto para que el tope del 30% del excedente NO recorte el bruto
    const registros = semana(8, 4);
    const fila = calcular(registros, { salario: { tipo: "dia", monto: 5000 } });
    expect(fila.faltas).toBe(1);
    // bruto = 5000 + 5000/6 = 5833.33; excedente*(0.3) = (25000-1575.2)*0.3 ≈ 7027 > bruto
    expect(fila.descuentoCalculado).toBeCloseTo(5000 + 5000 / 6, 2);
  });

  it("dos faltas en la misma semana acumulan 2/6 del séptimo día", () => {
    // Periodo de DOS semanas para que el tope del 30% del excedente no
    // recorte el bruto (con un periodo de 5 días, 2 faltas siempre topan:
    // bruto 2.33×S > 30% del excedente 1.5×S — eso lo cubre el CRITERIO 2).
    // Semana 1: trabaja lun-mié (faltas jue y vie). Semana 2: completa.
    const semana2: RegistroDia[] = [];
    for (let d = 13; d <= 17; d++) {
      semana2.push(reg(`2026-07-${d}`, "08:00:00", "entrada"));
      semana2.push(reg(`2026-07-${d}`, "16:00:00", "salida"));
    }
    const fila = calcularIncidencia({
      empleado: { id: "e1", nombre: "Ana" },
      salario: { tipo: "dia", monto: 5000 },
      registros: [...semana(8, 3), ...semana2],
      desde: "2026-07-06",
      hasta: "2026-07-17",
      hoy: "2026-07-17",
      horaEntrada: "08:00:00",
      config: CONFIG,
      bonos: [],
    });
    expect(fila.faltas).toBe(2);
    // bruto = 2 días + 2/6 del séptimo = 11,666.67 < tope (30% del excedente
    // de 10 días hábiles ≈ 14,054.88) → se observa el séptimo día exacto.
    expect(fila.descuentoCalculado).toBeCloseTo(2 * 5000 + 5000 * (2 / 6), 2);
  });
});

// =============================================================================
// CASO OBLIGATORIO 4: horas extra mixtas — dobles y triples por separado
// =============================================================================
describe("CRITERIO 4 — horas extra dobles y triples (Arts. 66-68 LFT)", () => {
  it("48h no genera extra en 2026; 60h → 9 dobles + 3 triples", () => {
    // 12 h/día × 5 días = 60 h; límite 2026 = 48 → 12 extra: 9 dobles, 3 triples
    const fila = calcular(semana(12, 5), {
      salario: { tipo: "hora", monto: 100 },
    });
    expect(fila.horasExtraDobles).toBe(9);
    expect(fila.horasExtraTriples).toBe(3);
    expect(fila.pagoHorasExtra).toBe(9 * 100 * 2 + 3 * 100 * 3); // 2700
    // Sin extra exactamente en el límite
    const alLimite = calcular(semana(9.6, 5), {
      salario: { tipo: "hora", monto: 100 },
    });
    expect(alLimite.horasExtraDobles).toBe(0);
    expect(alLimite.horasExtraTriples).toBe(0);
  });

  it("hasta 9 h extra todo se paga doble (sin triples)", () => {
    // 11 h/día × 5 = 55 h → 7 extra: todas dobles
    const fila = calcular(semana(11, 5), {
      salario: { tipo: "hora", monto: 100 },
    });
    expect(fila.horasExtraDobles).toBe(7);
    expect(fila.horasExtraTriples).toBe(0);
  });
});

// =============================================================================
// Reglas complementarias
// =============================================================================
describe("retardos: jamás descuento en pesos", () => {
  it("retardos sin regla de acumulación NO generan descuento", () => {
    const registros: RegistroDia[] = [];
    for (let d = 0; d < 5; d++) {
      const fecha = `2026-07-${String(6 + d).padStart(2, "0")}`;
      registros.push(reg(fecha, "09:30:00", "entrada")); // 1.5h tarde TODOS los días
      registros.push(reg(fecha, "17:30:00", "salida"));
    }
    const fila = calcular(registros);
    expect(fila.retardos).toBe(5);
    expect(fila.faltas).toBe(0);
    expect(fila.descuentoCalculado).toBe(0); // ni un peso por retardos
  });

  it("con reglamento interior (3 retardos = 1 falta) se convierten a falta", () => {
    const registros: RegistroDia[] = [];
    for (let d = 0; d < 5; d++) {
      const fecha = `2026-07-${String(6 + d).padStart(2, "0")}`;
      registros.push(reg(fecha, d < 3 ? "09:30:00" : "08:00:00", "entrada"));
      registros.push(reg(fecha, "16:00:00", "salida"));
    }
    const fila = calcular(registros, {
      salario: { tipo: "dia", monto: 5000 },
      config: { ...CONFIG, retardos_antes_de_falta: 3 },
    });
    expect(fila.retardos).toBe(3);
    expect(fila.faltasPorRetardos).toBe(1);
    expect(fila.faltas).toBe(1);
    // La falta por retardos descuenta el día pero NO séptimo día (no rompe
    // un ciclo de asistencia específico)
    expect(fila.descuentoCalculado).toBeCloseTo(5000, 2);
  });
});

describe("prima dominical (Art. 71)", () => {
  it("suma 25% del salario diario por domingo trabajado si la empresa la aplica", () => {
    const domingo: RegistroDia[] = [
      reg("2026-07-12", "08:00:00", "entrada"), // domingo
      reg("2026-07-12", "16:00:00", "salida"),
    ];
    const fila = calcularIncidencia({
      empleado: { id: "e1", nombre: "Ana" },
      salario: { tipo: "dia", monto: 600 },
      registros: [...semana(8, 5), ...domingo],
      desde: "2026-07-06",
      hasta: "2026-07-12",
      hoy: "2026-07-12",
      horaEntrada: "08:00:00",
      config: { ...CONFIG, aplica_prima_dominical: true },
      bonos: [],
    });
    expect(fila.primaDominical).toBe(150); // 600 * 0.25
  });
});

describe("bonos", () => {
  const bonoFijo: BonoAplicable = {
    id: "b1",
    nombre: "Puntualidad",
    tipo: "fijo",
    monto_o_pct: 300,
    condicion: null,
  };
  const bonoPct: BonoAplicable = {
    id: "b2",
    nombre: "Productividad",
    tipo: "porcentaje",
    monto_o_pct: 10,
    condicion: null,
  };
  const bonoCondicional: BonoAplicable = {
    id: "b3",
    nombre: "Asistencia perfecta",
    tipo: "condicional",
    monto_o_pct: 500,
    condicion: "asistencia_perfecta",
  };

  it("fijo y porcentaje se aplican; el condicional exige cumplir la condición", () => {
    const perfecta = calcular(semana(8, 5), {
      bonos: [bonoFijo, bonoPct, bonoCondicional],
    });
    expect(perfecta.bonosAplicados).toBe(300 + 0.1 * 3000 + 500);

    // Con una falta, el condicional de asistencia perfecta NO se aplica
    const conFalta = calcular(semana(8, 4), {
      bonos: [bonoFijo, bonoPct, bonoCondicional],
    });
    expect(conFalta.bonosDetalle.map((b) => b.nombre)).toEqual([
      "Puntualidad",
      "Productividad",
    ]);
  });
});

describe("alerta de faltas en 30 días (solo alerta, nunca acción automática)", () => {
  it("cuenta faltas de días hábiles de los últimos 30 días", () => {
    // Sin ningún registro, todos los días hábiles de los últimos 30 son falta
    const sinRegistros = faltasUltimos30Dias([], "2026-07-10");
    expect(sinRegistros).toBeGreaterThan(20); // ~22 días hábiles

    // Con entrada todos los días hábiles del rango, cero faltas
    const registros: RegistroDia[] = [];
    const inicio = new Date("2026-06-11T00:00:00Z");
    for (let i = 0; i < 30; i++) {
      const d = new Date(inicio);
      d.setUTCDate(inicio.getUTCDate() + i);
      registros.push(reg(d.toISOString().slice(0, 10), "08:00:00", "entrada"));
    }
    expect(faltasUltimos30Dias(registros, "2026-07-10")).toBe(0);
  });
});
