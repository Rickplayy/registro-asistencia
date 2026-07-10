import type { Metadata } from "next";

import { AltaEmpleadoWizard } from "./alta-wizard";

export const metadata: Metadata = {
  title: "Alta de empleado · Registro de Asistencia",
};

/**
 * Vista 8.4 — Alta de empleado en 2 pasos (Fase 1):
 *   1. Datos personales + consentimiento LFPDPPP.
 *   2. Puesto y empresa.
 * El paso 3 (enrolamiento biométrico) se activa en la Fase 2.
 */
export default function NuevoEmpleadoPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand">Alta de empleado</h1>
        <p className="text-sm text-muted-foreground">
          Paso 1: datos personales · Paso 2: puesto. El enrolamiento biométrico
          llega en la Fase 2.
        </p>
      </div>
      <AltaEmpleadoWizard />
    </div>
  );
}
