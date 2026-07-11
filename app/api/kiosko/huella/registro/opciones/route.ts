/**
 * Paso 1 del enrolamiento de huella EN el kiosko: el empleado se identifica
 * con su PIN y, si tiene consentimiento biometrico_huella vigente (registrado
 * por RH desde su ficha), se generan las opciones de creación del passkey.
 * El reto viaja en cookie httpOnly cifrada.
 */
import { NextResponse, type NextRequest } from "next/server";

import { buscarPorPin } from "@/lib/asistencia/checkin";
import {
  COOKIE_RETO_HUELLA,
  opcionesRegistroHuella,
  sellarReto,
  tieneConsentimientoHuella,
} from "@/lib/biometria/webauthn";
import { dispositivoDesdeCookie, origenYRpId } from "../../_shared";

export async function POST(req: NextRequest) {
  const dispositivo = await dispositivoDesdeCookie(req);
  if (!dispositivo) {
    return NextResponse.json(
      { error: "Kiosko no vinculado." },
      { status: 401 },
    );
  }
  if (!dispositivo.metodosHabilitados.includes("huella")) {
    return NextResponse.json(
      { error: "El método de huella no está habilitado para tu empresa." },
      { status: 403 },
    );
  }

  let pin = "";
  try {
    const body = await req.json();
    pin = String(body?.pin ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const empleado = await buscarPorPin(dispositivo.empresaId, pin);
  if (!empleado) {
    return NextResponse.json(
      { error: "PIN no reconocido. Verifica con tu administrador." },
      { status: 422 },
    );
  }

  // BLOQUEANTE (LFPDPPP): sin consentimiento registrado no se enciende WebAuthn.
  const consentido = await tieneConsentimientoHuella(
    dispositivo.empresaId,
    empleado.empleadoId,
  );
  if (!consentido) {
    return NextResponse.json(
      {
        error:
          "Este empleado no tiene consentimiento de huella registrado. RH debe registrarlo desde su ficha antes de enrolar.",
      },
      { status: 403 },
    );
  }

  const { origin, rpID } = origenYRpId(req);
  const opciones = await opcionesRegistroHuella(dispositivo, empleado, rpID);

  const res = NextResponse.json({
    opciones,
    empleadoNombre: empleado.empleadoNombre,
  });
  res.cookies.set(
    COOKIE_RETO_HUELLA,
    sellarReto({
      tipo: "registro",
      reto: opciones.challenge,
      empleadoId: empleado.empleadoId,
    }),
    {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 5 * 60,
      path: "/",
    },
  );
  // El origen se valida al confirmar; aquí solo se declara para depuración.
  res.headers.set("x-webauthn-origin", origin);
  return res;
}
