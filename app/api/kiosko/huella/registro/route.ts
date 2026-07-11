/**
 * Paso 2 del enrolamiento de huella: recibe la credencial creada por el
 * autenticador y la verifica contra el reto de la cookie. Solo se guarda la
 * clave PÚBLICA del passkey — el dato biométrico jamás salió del aparato.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

import {
  COOKIE_RETO_HUELLA,
  abrirReto,
  confirmarRegistroHuella,
} from "@/lib/biometria/webauthn";
import { dispositivoDesdeCookie, origenYRpId } from "../_shared";

export async function POST(req: NextRequest) {
  const dispositivo = await dispositivoDesdeCookie(req);
  if (!dispositivo) {
    return NextResponse.json(
      { error: "Kiosko no vinculado." },
      { status: 401 },
    );
  }

  const reto = abrirReto(
    req.cookies.get(COOKIE_RETO_HUELLA)?.value,
    "registro",
  );
  if (!reto?.empleadoId) {
    return NextResponse.json(
      { error: "El enrolamiento expiró. Vuelve a empezar." },
      { status: 400 },
    );
  }

  let credencial: RegistrationResponseJSON;
  try {
    const body = await req.json();
    credencial = body?.credencial;
    if (!credencial?.id) throw new Error("sin credencial");
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { origin, rpID } = origenYRpId(req);
  const resultado = await confirmarRegistroHuella(
    dispositivo,
    reto.empleadoId,
    credencial,
    reto.reto,
    origin,
    rpID,
  );

  const res = resultado.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: resultado.error }, { status: 422 });
  // El reto es de un solo uso.
  res.cookies.set(COOKIE_RETO_HUELLA, "", { maxAge: 0, path: "/" });
  return res;
}
