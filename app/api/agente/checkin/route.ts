/**
 * Evento de asistencia desde el AGENTE LOCAL (Fase 3, hardware dedicado).
 *
 * El lector físico (ZKTeco/Suprema) verifica la huella EN la terminal — la
 * plantilla vive en el hardware del cliente y nunca llega aquí. El agente
 * local solo reenvía "el empleado N marcó": la confianza está delegada al
 * lector, autenticado con la API key de su dispositivo (tipo lector_fisico).
 *
 * Autenticación: header `x-api-key` con la clave generada en el panel de
 * Dispositivos. En la base solo existe su hash. Transporte: HTTPS (TLS 1.3
 * garantizado por la plataforma de hosting; el agente además lo exige de su
 * lado — ver agente-local/README.md).
 */
import { NextResponse, type NextRequest } from "next/server";

import {
  buscarPorNumeroEmpleado,
  registrarMarcacion,
  validarDispositivo,
} from "@/lib/asistencia/checkin";
import { createAdminClient } from "@/lib/db/admin";

// Mismo freno anti fuerza bruta que el kiosko (memoria del proceso).
const VENTANA_MS = 60_000;
const MAX_FALLOS = 10;
const fallos = new Map<string, number[]>();

function excedido(id: string): boolean {
  const ahora = Date.now();
  const lista = (fallos.get(id) ?? []).filter((t) => ahora - t < VENTANA_MS);
  fallos.set(id, lista);
  return lista.length >= MAX_FALLOS;
}

function registrarFallo(id: string) {
  const lista = fallos.get(id) ?? [];
  lista.push(Date.now());
  fallos.set(id, lista);
}

export async function POST(req: NextRequest) {
  const clave = req.headers.get("x-api-key") ?? "";
  const dispositivo = await validarDispositivo(clave);
  if (!dispositivo) {
    return NextResponse.json(
      { error: "API key no válida o dispositivo desactivado." },
      { status: 401 },
    );
  }
  // Este endpoint es EXCLUSIVO de lectores físicos: un kiosko web comprometido
  // no puede usarlo para saltarse la verificación biométrica del navegador.
  if (dispositivo.tipo !== "lector_fisico") {
    return NextResponse.json(
      { error: "Este endpoint es solo para dispositivos tipo lector_fisico." },
      { status: 403 },
    );
  }
  if (!dispositivo.metodosHabilitados.includes("huella")) {
    return NextResponse.json(
      { error: "El método de huella no está habilitado para esta empresa." },
      { status: 403 },
    );
  }

  if (excedido(dispositivo.id)) {
    return NextResponse.json(
      { error: "Demasiados intentos fallidos. Espera un minuto." },
      { status: 429 },
    );
  }

  let numeroEmpleado = "";
  let eventoId = "";
  try {
    const body = await req.json();
    numeroEmpleado = String(body?.numero_empleado ?? "").trim();
    eventoId = String(body?.evento_id ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  if (!numeroEmpleado) {
    return NextResponse.json(
      { error: "Falta numero_empleado" },
      { status: 400 },
    );
  }

  const empleado = await buscarPorNumeroEmpleado(
    dispositivo.empresaId,
    numeroEmpleado,
  );
  if (!empleado) {
    registrarFallo(dispositivo.id);
    return NextResponse.json(
      { error: "Empleado no reconocido o inactivo." },
      { status: 422 },
    );
  }

  const resultado = await registrarMarcacion(dispositivo, "huella", empleado);

  // Trazabilidad del evento del hardware (además del registro de asistencia).
  const admin = createAdminClient();
  await admin.from("auditoria").insert({
    usuario_admin_id: null,
    empresa_id: dispositivo.empresaId,
    accion: "biometria.verificacion_checkin",
    entidad_afectada: "dispositivos",
    entidad_id: dispositivo.id,
    detalles: {
      origen: "agente_local",
      metodo: "huella",
      evento_id: eventoId || null,
      resultado: resultado.ok ? "registrado" : "rechazado",
    },
  });

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: 422 });
  }
  return NextResponse.json(resultado);
}
