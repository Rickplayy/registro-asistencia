import type { Metadata } from "next";

import { RegistroForm } from "./registro-form";

export const metadata: Metadata = {
  title: "Registrar empresa · Registro de Asistencia",
};

/** Onboarding: crea la empresa (tenant) y su primer administrador. */
export default function RegistroPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand text-2xl font-bold text-brand-foreground">
            RA
          </div>
          <h1 className="text-2xl font-semibold text-brand">
            Registra tu empresa
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea tu cuenta de administrador y empieza a registrar asistencia.
          </p>
        </div>
        <RegistroForm />
      </div>
    </main>
  );
}
