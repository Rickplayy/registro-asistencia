import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kiosko · Registro de Asistencia",
};

/**
 * Vista 8.2 — Kiosko de fichaje (placeholder de Fase 0).
 * El check-in por PIN y QR se implementa en la Fase 1; facial y huella en
 * las Fases 2 y 3. Este flujo NUNCA comparte sesión con el panel admin.
 */
export default function KioskoPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand px-4 text-brand-foreground">
      <p className="text-lg opacity-80">Kiosko de fichaje</p>
      <h1 className="mt-2 text-3xl font-semibold">Disponible en la Fase 1</h1>
      <p className="mt-4 max-w-md text-center text-sm opacity-70">
        Aquí vivirá el check-in por PIN, QR, biometría facial y huella, con
        botones grandes y confirmación inmediata.
      </p>
    </main>
  );
}
