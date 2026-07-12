/**
 * Planes de suscripción (Fase 5) — única fuente de verdad de límites y
 * funciones por plan. Cambiar un límite es editar este archivo: los
 * enforcement points (alta de empleados, métodos del kiosko, white-label,
 * nómina) leen de aquí.
 *
 * Módulo puro: sin base de datos, testeable de forma aislada.
 */

export type PlanId = "basico" | "pro" | "enterprise";

export type Plan = {
  id: PlanId;
  nombre: string;
  precioMensualMxn: number;
  /** null = sin límite. */
  maxEmpleados: number | null;
  /** Métodos de check-in que el plan permite habilitar. */
  metodosPermitidos: ("pin" | "qr" | "facial" | "huella")[];
  /** ¿Puede subir logo y color de marca? */
  whiteLabel: boolean;
  /** ¿Incluye el módulo de incidencias y proyección de nómina (Fase 6)? */
  nomina: boolean;
  /** ¿Puede registrar lectores físicos (agente local)? */
  lectoresFisicos: boolean;
};

export const PLANES: Record<PlanId, Plan> = {
  basico: {
    id: "basico",
    nombre: "Básico",
    precioMensualMxn: 499,
    maxEmpleados: 25,
    metodosPermitidos: ["pin", "qr"],
    whiteLabel: false,
    nomina: false,
    lectoresFisicos: false,
  },
  pro: {
    id: "pro",
    nombre: "Pro",
    precioMensualMxn: 1499,
    maxEmpleados: 100,
    metodosPermitidos: ["pin", "qr", "facial", "huella"],
    whiteLabel: true,
    nomina: true,
    lectoresFisicos: false,
  },
  enterprise: {
    id: "enterprise",
    nombre: "Enterprise",
    precioMensualMxn: 3999,
    maxEmpleados: null,
    metodosPermitidos: ["pin", "qr", "facial", "huella"],
    whiteLabel: true,
    nomina: true,
    lectoresFisicos: true,
  },
};

/** Plan desde el texto guardado en empresas.plan (fallback defensivo a básico). */
export function obtenerPlan(planId: string | null | undefined): Plan {
  return PLANES[(planId ?? "basico") as PlanId] ?? PLANES.basico;
}

export function esPlanValido(planId: string): planId is PlanId {
  return planId in PLANES;
}

/** ¿El plan permite dar de alta un empleado más? */
export function permiteMasEmpleados(
  plan: Plan,
  activosActuales: number,
): boolean {
  return plan.maxEmpleados === null || activosActuales < plan.maxEmpleados;
}

/** Filtra los métodos configurados de la empresa a los que el plan permite. */
export function metodosSegunPlan(
  plan: Plan,
  metodosConfigurados: string[],
): string[] {
  return metodosConfigurados.filter((m) =>
    (plan.metodosPermitidos as string[]).includes(m),
  );
}
