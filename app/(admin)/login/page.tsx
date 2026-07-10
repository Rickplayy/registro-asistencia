import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión · Registro de Asistencia",
};

/**
 * Vista 8.1 — Inicio de sesión del panel administrativo.
 * Deliberadamente simple: es el punto de entrada a datos sensibles.
 * Separada por completo del flujo de check-in de empleados (kiosko).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* Espacio para el logo de la empresa cliente (marca blanca) */}
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand text-2xl font-bold text-brand-foreground">
            RA
          </div>
          <h1 className="text-2xl font-semibold text-brand">
            Registro de Asistencia
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Panel administrativo · RH
          </p>
        </div>
        <LoginForm
          mensajeInicial={
            error === "sin-perfil"
              ? "Tu cuenta no tiene un perfil administrativo activo. Contacta al administrador de tu empresa."
              : undefined
          }
        />
      </div>
    </main>
  );
}
