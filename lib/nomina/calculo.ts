/**
 * Motor de cálculo de incidencias (Fase 6, secciones 2.3 y 11) — PURO.
 * Sin base de datos: recibe registros y configuración, regresa la proyección.
 *
 * REGLAS LEGALES QUE ESTE MOTOR NO PERMITE ROMPER (con tests en
 * tests/nomina.test.ts):
 *  1. NUNCA se descuenta dinero por minutos de retardo (Art. 110 LFT). Los
 *     retardos solo pueden acumularse a una falta si el reglamento interior
 *     lo define (retardos_antes_de_falta > 0).
 *  2. El descuento jamás excede el tope configurado (≤30%) del EXCEDENTE
 *     sobre el salario mínimo, y jamás deja el pago del periodo por debajo
 *     del salario mínimo (Art. 110 LFT).
 *  3. Una falta resta el día y, por semana con faltas, la parte proporcional
 *     del séptimo día (Art. 69 LFT).
 *  4. Horas extra: las primeras 9 h/semana al DOBLE, el excedente al TRIPLE
 *     (Arts. 66-68 LFT), sobre el límite de jornada semanal vigente del año.
 *
 * Este módulo CALCULA Y PROYECTA: no timbra CFDI ni calcula ISR/IMSS.
 */
import { esDiaHabil, rangoFechas } from "@/lib/asistencia/fechas";
import { inicioDeSemana, limiteSemanalHoras } from "@/lib/asistencia/jornada";
import {
  esRetardo,
  horasDelDia,
  primerasEntradas,
  type RegistroDia,
} from "@/lib/asistencia/reporte";

/** Jornada diaria de referencia para convertir salario hora↔día. */
export const JORNADA_DIARIA_HORAS = 8;
/** Primeras horas extra de la semana que se pagan al doble (Art. 66-68). */
export const HORAS_EXTRA_DOBLES_MAX = 9;
/** Prima dominical: 25% adicional del salario diario (Art. 71). */
export const PRIMA_DOMINICAL_PCT = 0.25;
/** Tope legal ABSOLUTO de descuento sobre el excedente del mínimo. */
export const TOPE_DESCUENTO_LEGAL_PCT = 30;

export type SalarioEmpleado = { tipo: "hora" | "dia"; monto: number };

export type ConfigNomina = {
  tope_descuento_pct: number;
  minutos_tolerancia: number;
  retardos_antes_de_falta: number; // 0 = desactivado
  faltas_alerta_30d: number;
  aplica_prima_dominical: boolean;
  salario_minimo_diario: number;
};

export type BonoAplicable = {
  id: string;
  nombre: string;
  tipo: "fijo" | "porcentaje" | "condicional";
  monto_o_pct: number;
  condicion: "sin_faltas" | "sin_retardos" | "asistencia_perfecta" | null;
};

export type FilaIncidencia = {
  empleadoId: string;
  nombre: string;
  tipoSalario: "hora" | "dia";
  salarioMonto: number;
  diasTrabajados: number;
  horasTrabajadas: number;
  horasExtraDobles: number;
  horasExtraTriples: number;
  pagoHorasExtra: number;
  retardos: number;
  /** Faltas reales + faltas por acumulación de retardos. */
  faltas: number;
  faltasPorRetardos: number;
  pagoBase: number;
  descuentoCalculado: number;
  primaDominical: number;
  bonosAplicados: number;
  bonosDetalle: { nombre: string; monto: number }[];
  totalProyectado: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function salarioDiarioDe(s: SalarioEmpleado): number {
  return s.tipo === "dia" ? s.monto : s.monto * JORNADA_DIARIA_HORAS;
}

export function salarioPorHoraDe(s: SalarioEmpleado): number {
  return s.tipo === "hora" ? s.monto : s.monto / JORNADA_DIARIA_HORAS;
}

/**
 * Calcula la incidencia de UN empleado en el periodo [desde, hasta].
 * `registros` deben ser SOLO del empleado y estar dentro del periodo.
 * `bonos` ya vienen filtrados por el caller: activos y, si requieren
 * aprobación, únicamente los aprobados para este empleado/periodo.
 */
export function calcularIncidencia(args: {
  empleado: { id: string; nombre: string };
  salario: SalarioEmpleado;
  registros: RegistroDia[];
  desde: string;
  hasta: string;
  /** Limita faltas a días transcurridos. */
  hoy: string;
  horaEntrada: string; // jornada de referencia de la empresa (HH:MM:SS)
  config: ConfigNomina;
  bonos: BonoAplicable[];
}): FilaIncidencia {
  const {
    empleado,
    salario,
    registros,
    desde,
    hasta,
    hoy,
    horaEntrada,
    config,
  } = args;

  const salarioDiario = salarioDiarioDe(salario);
  const salarioHora = salarioPorHoraDe(salario);
  const hastaEfectivo = hasta < hoy ? hasta : hoy;
  const dias = rangoFechas(desde, hastaEfectivo);
  const diasHabiles = dias.filter(esDiaHabil);

  // ---- Agrupar registros por día -------------------------------------------
  const porDia = new Map<string, RegistroDia[]>();
  for (const r of registros) {
    const lista = porDia.get(r.fecha) ?? [];
    lista.push(r);
    porDia.set(r.fecha, lista);
  }

  // ---- Días trabajados, retardos, horas por semana, domingos ---------------
  const jornada = {
    hora_entrada: horaEntrada,
    tolerancia_retardo_minutos: config.minutos_tolerancia,
  };
  let diasTrabajados = 0;
  let retardos = 0;
  let horasTrabajadas = 0;
  let domingosTrabajados = 0;
  const horasPorSemana = new Map<string, number>();
  const faltasPorSemana = new Map<string, number>();

  for (const [fecha, delDia] of porDia) {
    const primera = primerasEntradas(delDia).get(empleado.id);
    if (!primera) continue;
    diasTrabajados++;
    if (esRetardo(primera, jornada)) retardos++;
    const horasDia = horasDelDia(delDia);
    horasTrabajadas += horasDia;
    const semana = inicioDeSemana(fecha);
    horasPorSemana.set(semana, (horasPorSemana.get(semana) ?? 0) + horasDia);
    if (new Date(`${fecha}T00:00:00Z`).getUTCDay() === 0) domingosTrabajados++;
  }

  // ---- Faltas reales (día hábil transcurrido sin entrada) ------------------
  let faltasReales = 0;
  for (const fecha of diasHabiles) {
    const delDia = porDia.get(fecha) ?? [];
    const asistio = delDia.some((r) => r.tipo === "entrada");
    if (!asistio) {
      faltasReales++;
      const semana = inicioDeSemana(fecha);
      faltasPorSemana.set(semana, (faltasPorSemana.get(semana) ?? 0) + 1);
    }
  }

  // ---- Regla 1: retardos JAMÁS en pesos; solo acumulan a falta -------------
  const faltasPorRetardos =
    config.retardos_antes_de_falta > 0
      ? Math.floor(retardos / config.retardos_antes_de_falta)
      : 0;
  const faltas = faltasReales + faltasPorRetardos;

  // ---- Regla 4: horas extra por semana (dobles/triples) --------------------
  const limiteSemana = limiteSemanalHoras(desde);
  let horasExtraDobles = 0;
  let horasExtraTriples = 0;
  for (const [, horasSemana] of horasPorSemana) {
    const extra = Math.max(0, horasSemana - limiteSemana);
    const dobles = Math.min(extra, HORAS_EXTRA_DOBLES_MAX);
    horasExtraDobles += dobles;
    horasExtraTriples += extra - dobles;
  }
  const pagoHorasExtra =
    horasExtraDobles * salarioHora * 2 + horasExtraTriples * salarioHora * 3;

  // ---- Pago base esperado del periodo --------------------------------------
  const pagoBase = salarioDiario * diasHabiles.length;

  // ---- Regla 3: descuento por faltas + séptimo día proporcional ------------
  // Cada falta resta su día; por cada semana con faltas se pierde además la
  // parte proporcional del séptimo día (1/6 por falta, máx. un día/semana).
  let descuentoBruto = faltas * salarioDiario;
  for (const [, faltasSemana] of faltasPorSemana) {
    descuentoBruto += Math.min(
      salarioDiario,
      salarioDiario * (faltasSemana / 6),
    );
  }

  // ---- Regla 2: topes legales ----------------------------------------------
  const salarioMinimoPeriodo =
    config.salario_minimo_diario * diasHabiles.length;
  const excedente = Math.max(0, pagoBase - salarioMinimoPeriodo);
  const topePct =
    Math.min(config.tope_descuento_pct, TOPE_DESCUENTO_LEGAL_PCT) / 100;
  // El descuento topa en el % del excedente Y nunca puede dejar el pago del
  // periodo por debajo del salario mínimo (cinturón y tirantes).
  const descuentoCalculado = round2(
    Math.min(descuentoBruto, excedente * topePct, excedente),
  );

  // ---- Prima dominical (Art. 71), si la empresa la aplica ------------------
  const primaDominical = config.aplica_prima_dominical
    ? round2(domingosTrabajados * salarioDiario * PRIMA_DOMINICAL_PCT)
    : 0;

  // ---- Bonos (el caller ya filtró aprobaciones) -----------------------------
  const bonosDetalle: { nombre: string; monto: number }[] = [];
  for (const bono of args.bonos) {
    if (bono.tipo === "condicional") {
      const cumple =
        bono.condicion === "sin_faltas"
          ? faltas === 0
          : bono.condicion === "sin_retardos"
            ? retardos === 0
            : faltas === 0 && retardos === 0; // asistencia_perfecta
      if (!cumple) continue;
      bonosDetalle.push({
        nombre: bono.nombre,
        monto: round2(bono.monto_o_pct),
      });
    } else if (bono.tipo === "fijo") {
      bonosDetalle.push({
        nombre: bono.nombre,
        monto: round2(bono.monto_o_pct),
      });
    } else {
      bonosDetalle.push({
        nombre: bono.nombre,
        monto: round2((bono.monto_o_pct / 100) * pagoBase),
      });
    }
  }
  const bonosAplicados = round2(bonosDetalle.reduce((s, b) => s + b.monto, 0));

  const totalProyectado = round2(
    pagoBase -
      descuentoCalculado +
      pagoHorasExtra +
      primaDominical +
      bonosAplicados,
  );

  return {
    empleadoId: empleado.id,
    nombre: empleado.nombre,
    tipoSalario: salario.tipo,
    salarioMonto: salario.monto,
    diasTrabajados,
    horasTrabajadas: round2(horasTrabajadas),
    horasExtraDobles: round2(horasExtraDobles),
    horasExtraTriples: round2(horasExtraTriples),
    pagoHorasExtra: round2(pagoHorasExtra),
    retardos,
    faltas,
    faltasPorRetardos,
    pagoBase: round2(pagoBase),
    descuentoCalculado,
    primaDominical,
    bonosAplicados,
    bonosDetalle,
    totalProyectado,
  };
}

/**
 * Faltas injustificadas de los ÚLTIMOS 30 días (para la alerta de la sección
 * 2.3: >3 en 30 días es causal de rescisión — el sistema SOLO alerta, la
 * decisión siempre es humana).
 */
export function faltasUltimos30Dias(
  registrosEmpleado: RegistroDia[],
  hoy: string,
): number {
  const inicio = new Date(`${hoy}T00:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - 29);
  const desde = inicio.toISOString().slice(0, 10);

  const conEntrada = new Set(
    registrosEmpleado.filter((r) => r.tipo === "entrada").map((r) => r.fecha),
  );
  return rangoFechas(desde, hoy).filter(
    (f) => esDiaHabil(f) && !conEntrada.has(f),
  ).length;
}
