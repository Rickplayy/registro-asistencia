/**
 * Vinculación del kiosko: recibe la clave del dispositivo, la valida y la
 * guarda en una cookie httpOnly propia del aparato. La clave nunca queda
 * accesible a JavaScript del navegador.
 */
import { NextResponse, type NextRequest } from "next/server";

import { validarDispositivo } from "@/lib/asistencia/checkin";
import {
  ipDeRequest,
  registrarFallo,
  registrarFalloYVerificar,
} from "@/lib/seguridad/rate-limit";

const COOKIE_KIOSKO = "ra_kiosko";
const DIAS_VIGENCIA = 90;
/** Freno anti fuerza bruta de claves de vinculación (Fase 5): 5 fallos/min por IP. */
const LIMITE_VINCULAR = { max: 5, ventanaMs: 60_000 };

export async function POST(req: NextRequest) {
  const llaveIp = `vincular:${ipDeRequest(req.headers)}`;
  if (registrarFalloYVerificar(llaveIp, LIMITE_VINCULAR).excedido) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera un minuto." },
      { status: 429 },
    );
  }

  let clave = "";
  try {
    const body = await req.json();
    clave = String(body?.clave ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const dispositivo = await validarDispositivo(clave);
  if (!dispositivo) {
    registrarFallo(llaveIp);
    return NextResponse.json(
      { error: "Clave no válida o dispositivo desactivado." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({
    ok: true,
    dispositivo: dispositivo.nombre,
    empresa: dispositivo.empresaNombre,
  });
  res.cookies.set(COOKIE_KIOSKO, clave, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: DIAS_VIGENCIA * 24 * 60 * 60,
    path: "/",
  });
  return res;
}

/** Desvincular el kiosko de este aparato. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_KIOSKO, "", { maxAge: 0, path: "/" });
  return res;
}
