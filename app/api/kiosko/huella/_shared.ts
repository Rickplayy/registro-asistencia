/** Utilidades compartidas de los endpoints WebAuthn del kiosko. */
import type { NextRequest } from "next/server";

import {
  validarDispositivo,
  type DispositivoVinculado,
} from "@/lib/asistencia/checkin";

/** Autentica el kiosko por su cookie de vinculación. */
export async function dispositivoDesdeCookie(
  req: NextRequest,
): Promise<DispositivoVinculado | null> {
  const clave = req.cookies.get("ra_kiosko")?.value ?? "";
  return validarDispositivo(clave);
}

/**
 * Origen y RP ID de la petición. WebAuthn amarra cada credencial al dominio:
 * en desarrollo es localhost; en producción, el dominio del kiosko.
 */
export function origenYRpId(req: NextRequest): {
  origin: string;
  rpID: string;
} {
  const origin =
    req.headers.get("origin") ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return { origin, rpID: new URL(origin).hostname };
}
