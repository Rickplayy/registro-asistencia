import type { Metadata } from "next";
import { cookies } from "next/headers";

import { validarDispositivo } from "@/lib/asistencia/checkin";
import { KioskoCheckin } from "./kiosko-checkin";
import { KioskoVincular } from "./kiosko-vincular";

export const metadata: Metadata = {
  title: "Kiosko · Registro de Asistencia",
};

// La vinculación depende de la cookie del aparato: siempre dinámico.
export const dynamic = "force-dynamic";

/**
 * Vista 8.2 — Kiosko de fichaje.
 * Reloj visible, botones grandes por método y confirmación inmediata.
 * PIN y QR activos en Fase 1; facial y huella se habilitan en Fases 2-3.
 */
export default async function KioskoPage() {
  const cookieStore = await cookies();
  const clave = cookieStore.get("ra_kiosko")?.value ?? "";
  const dispositivo = clave ? await validarDispositivo(clave) : null;

  if (!dispositivo) {
    return <KioskoVincular />;
  }

  return (
    <KioskoCheckin
      empresaNombre={dispositivo.empresaNombre}
      dispositivoNombre={dispositivo.nombre ?? "Kiosko"}
      metodosHabilitados={dispositivo.metodosHabilitados}
    />
  );
}
