/**
 * Política de retención y borrado (ARCO, sección 2.2) — lógica pura.
 * La política completa está documentada en docs/RETENCION-ARCO.md.
 */

/**
 * Días que se conservan los datos personales de un empleado dado de baja
 * antes de poder purgarse. La LFT exige conservar registros laborales al
 * menos un año tras la terminación (Art. 804); se usa ese mínimo.
 */
export const RETENCION_DIAS = 365;

export type Purgabilidad =
  | { purgable: true }
  | { purgable: false; motivo: string; diasRestantes?: number };

/** ¿Puede purgarse un empleado? Requiere baja + periodo de retención cumplido. */
export function evaluarPurga(
  estatus: string,
  fechaBaja: string | null,
  hoy: string,
): Purgabilidad {
  if (estatus !== "baja") {
    return {
      purgable: false,
      motivo: "Solo pueden purgarse empleados dados de baja.",
    };
  }
  if (!fechaBaja) {
    return {
      purgable: false,
      motivo:
        "El empleado no tiene fecha de baja registrada; regístrala antes de purgar.",
    };
  }
  const transcurridos = Math.floor(
    (Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${fechaBaja}T00:00:00Z`)) /
      86_400_000,
  );
  if (transcurridos < RETENCION_DIAS) {
    return {
      purgable: false,
      diasRestantes: RETENCION_DIAS - transcurridos,
      motivo: `Aún en periodo de retención legal (${RETENCION_DIAS} días desde la baja): faltan ${RETENCION_DIAS - transcurridos} días.`,
    };
  }
  return { purgable: true };
}
