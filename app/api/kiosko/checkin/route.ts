/**
 * Check-in del kiosko (PIN o QR). El dispositivo se autentica con su cookie
 * de vinculación; el empleado, con su PIN o su QR rotativo.
 */
import { NextResponse, type NextRequest } from "next/server";

import { registrarCheckin, validarDispositivo } from "@/lib/asistencia/checkin";

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

  if ((metodo !== "pin" && metodo !== "qr") || !valor) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }

  const resultado = await registrarCheckin(dispositivo, metodo, valor);
  if (!resultado.ok) {
    registrarFallo(dispositivo.id);
    return NextResponse.json({ error: resultado.error }, { status: 422 });
  }

  return NextResponse.json(resultado);
}
