/**
 * Check-in del kiosko (PIN, QR, rostro o huella). El dispositivo se autentica
 * con su cookie de vinculación; el empleado, con su PIN, su QR rotativo, su
 * rostro o su huella (WebAuthn). En facial el cuerpo trae SOLO el descriptor
 * de 128 números; en huella, SOLO la aserción criptográfica — nunca datos
 * biométricos crudos.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

import {
  registrarCheckin,
  registrarMarcacion,
  validarDispositivo,
} from "@/lib/asistencia/checkin";
import {
  COOKIE_RETO_HUELLA,
  abrirReto,
  verificarCheckinHuella,
} from "@/lib/biometria/webauthn";
import { origenYRpId } from "../huella/_shared";

// Freno básico anti fuerza bruta por dispositivo (memoria del proceso; el
// hardening distribuido llega en la Fase 5).
const VENTANA_MS = 60_000;
const MAX_FALLOS = 10;
const fallos = new Map<string, number[]>();

function excedido(dispositivoId: string): boolean {
  const ahora = Date.now();
  const lista = (fallos.get(dispositivoId) ?? []).filter(
    (t) => ahora - t < VENTANA_MS,
  );
  fallos.set(dispositivoId, lista);
  return lista.length >= MAX_FALLOS;
}

function registrarFallo(dispositivoId: string) {
  const lista = fallos.get(dispositivoId) ?? [];
  lista.push(Date.now());
  fallos.set(dispositivoId, lista);
}

export async function POST(req: NextRequest) {
  const clave = req.cookies.get("ra_kiosko")?.value ?? "";
  const dispositivo = await validarDispositivo(clave);
  if (!dispositivo) {
    return NextResponse.json(
      { error: "Kiosko no vinculado. Pide la clave a tu administrador." },
      { status: 401 },
    );
  }

  if (excedido(dispositivo.id)) {
    return NextResponse.json(
      { error: "Demasiados intentos fallidos. Espera un minuto." },
      { status: 429 },
    );
  }

  let metodo = "";
  let valor = "";
  try {
    const body = await req.json();
    metodo = String(body?.metodo ?? "");
    valor = String(body?.valor ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  if (
    (metodo !== "pin" &&
      metodo !== "qr" &&
      metodo !== "facial" &&
      metodo !== "huella") ||
    !valor
  ) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }

  // Huella (WebAuthn): verificación de la aserción contra el reto de la cookie.
  if (metodo === "huella") {
    if (!dispositivo.metodosHabilitados.includes("huella")) {
      return NextResponse.json(
        { error: "Este método no está habilitado para tu empresa." },
        { status: 422 },
      );
    }
    const reto = abrirReto(
      req.cookies.get(COOKIE_RETO_HUELLA)?.value,
      "checkin",
    );
    if (!reto) {
      return NextResponse.json(
        { error: "La verificación expiró. Intenta de nuevo." },
        { status: 400 },
      );
    }
    let asercion: AuthenticationResponseJSON;
    try {
      asercion = JSON.parse(valor);
    } catch {
      return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
    }
    const { origin, rpID } = origenYRpId(req);
    const empleado = await verificarCheckinHuella(
      dispositivo,
      asercion,
      reto.reto,
      origin,
      rpID,
    );
    if (!empleado) {
      registrarFallo(dispositivo.id);
      const res = NextResponse.json(
        { error: "Huella no reconocida. Intenta de nuevo o usa tu PIN." },
        { status: 422 },
      );
      res.cookies.set(COOKIE_RETO_HUELLA, "", { maxAge: 0, path: "/" });
      return res;
    }
    const resultado = await registrarMarcacion(dispositivo, "huella", empleado);
    const res = resultado.ok
      ? NextResponse.json(resultado)
      : NextResponse.json({ error: resultado.error }, { status: 422 });
    // El reto es de un solo uso.
    res.cookies.set(COOKIE_RETO_HUELLA, "", { maxAge: 0, path: "/" });
    return res;
  }

  const resultado = await registrarCheckin(dispositivo, metodo, valor);
  if (!resultado.ok) {
    registrarFallo(dispositivo.id);
    return NextResponse.json({ error: resultado.error }, { status: 422 });
  }

  return NextResponse.json(resultado);
}
