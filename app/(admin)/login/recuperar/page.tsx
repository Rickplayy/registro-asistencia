import type { Metadata } from "next";

import { RecuperarForm } from "./recuperar-form";

export const metadata: Metadata = {
  title: "Recuperar contraseña · Registro de Asistencia",
};

export default function RecuperarPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm">
        <RecuperarForm />
      </div>
    </main>
  );
}
