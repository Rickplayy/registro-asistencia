/**
 * Opciones de aserción para el check-in por huella. Con credenciales
 * descubribles el autenticador identifica al empleado: no se teclea nada.
 */
import { NextResponse, type NextRequest } from "next/server";

import {
  COOKIE_RETO_HUELLA,
  opcionesCheckinHuella,
  sellarReto,
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
  if (!dispositivo.metodosHabilitados.includes("huella")) {
    return NextResponse.json(
      { error: "El método de huella no está habilitado para tu empresa." },
      { status: 403 },
    );
  }

  const { rpID } = origenYRpId(req);
  const opciones = await opcionesCheckinHuella(rpID);

  const res = NextResponse.json({ opciones });
  res.cookies.set(
    COOKIE_RETO_HUELLA,
    sellarReto({ tipo: "checkin", reto: opciones.challenge }),
    {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 5 * 60,
      path: "/",
    },
  );
  return res;
}
