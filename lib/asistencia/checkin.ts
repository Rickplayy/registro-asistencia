/**
 * Núcleo del check-in del kiosko (solo servidor).
 *
 * El kiosko NO tiene sesión de Supabase: se identifica con la API key de su
 * dispositivo (cookie httpOnly). Por eso este módulo usa el cliente
 * service_role — pero SIEMPRE acota cada consulta a la empresa del
 * dispositivo, que es la única autoridad de tenant en este flujo.
 */
import { createHash } from "node:crypto";

import { createAdminClient } from "@/lib/db/admin";
import { hashPin } from "@/lib/auth/pin";
import { parsearPayloadQr, verificarCodigoQr } from "@/lib/auth/qr";
import { decryptField } from "@/lib/crypto";
import { fechaMx, horaMx } from "@/lib/asistencia/fechas";

/** Minutos mínimos entre dos marcaciones del mismo empleado (anti doble-clic). */
const MINUTOS_ANTIRREBOTE = 1;

export function hashApiKey(clave: string): string {
  return createHash("sha256").update(clave).digest("hex");
}

export type DispositivoVinculado = {
  id: string;
  empresaId: string;
  empresaNombre: string;
  nombre: string | null;
  metodosHabilitados: string[];
};

/** Valida la API key de un kiosko y regresa su dispositivo + empresa. */
export async function validarDispositivo(
  clave: string,
): Promise<DispositivoVinculado | null> {
  if (!clave) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("dispositivos")
    .select(
      "id, empresa_id, nombre, activo, empresas(nombre, activa, config_metodos_habilitados)",
    )
    .eq("api_key_hash", hashApiKey(clave))
    .eq("activo", true)
    .maybeSingle();
  if (!data) return null;
  const empresa = data.empresas as unknown as {
    nombre: string;
    activa: boolean;
    config_metodos_habilitados: string[];
  };
  if (!empresa?.activa) return null;
  return {
    id: data.id,
    empresaId: data.empresa_id,
    empresaNombre: empresa.nombre,
    nombre: data.nombre,
    metodosHabilitados: empresa.config_metodos_habilitados ?? ["pin", "qr"],
  };
}

export type ResultadoCheckin =
  | {
      ok: true;
      empleadoNombre: string;
      tipo: "entrada" | "salida";
      hora: string; // HH:MM:SS
    }
  | { ok: false; error: string };

type EmpleadoMetodo = {
  empleadoId: string;
  empleadoNombre: string;
};

async function buscarPorPin(
  empresaId: string,
  pin: string,
): Promise<EmpleadoMetodo | null> {
  // Un PIN con formato inválido no debe tirar la petición (hashPin lanza):
  // se trata igual que un PIN incorrecto.
  let pinHash: string;
  try {
    pinHash = hashPin(pin, empresaId);
  } catch {
    return null;
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("metodos_acceso")
    .select("empleado_id, empleados(nombre, estatus)")
    .eq("empresa_id", empresaId)
    .eq("tipo", "pin")
    .eq("activo", true)
    .eq("valor_hash_o_token", pinHash)
    .maybeSingle();
  if (!data) return null;
  const emp = data.empleados as unknown as { nombre: string; estatus: string };
  if (emp?.estatus !== "activo") return null;
  return { empleadoId: data.empleado_id, empleadoNombre: emp.nombre };
}

async function buscarPorQr(
  empresaId: string,
  textoQr: string,
): Promise<EmpleadoMetodo | null> {
  const payload = parsearPayloadQr(textoQr);
  if (!payload) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("metodos_acceso")
    .select(
      "empleado_id, empresa_id, valor_hash_o_token, empleados(nombre, estatus)",
    )
    .eq("id", payload.metodoId)
    .eq("tipo", "qr")
    .eq("activo", true)
    .maybeSingle();
  // El QR debe pertenecer a la MISMA empresa que el dispositivo (aislamiento).
  if (!data || data.empresa_id !== empresaId) return null;
  const emp = data.empleados as unknown as { nombre: string; estatus: string };
  if (emp?.estatus !== "activo") return null;
  const secreto = decryptField(data.valor_hash_o_token);
  if (!verificarCodigoQr(secreto, payload.codigo)) return null;
  return { empleadoId: data.empleado_id, empleadoNombre: emp.nombre };
}

/** Registra una marcación de entrada/salida para un kiosko ya validado. */
export async function registrarCheckin(
  dispositivo: DispositivoVinculado,
  metodo: "pin" | "qr",
  valor: string,
): Promise<ResultadoCheckin> {
  if (!dispositivo.metodosHabilitados.includes(metodo)) {
    return {
      ok: false,
      error: "Este método no está habilitado para tu empresa.",
    };
  }

  const encontrado =
    metodo === "pin"
      ? await buscarPorPin(dispositivo.empresaId, valor)
      : await buscarPorQr(dispositivo.empresaId, valor);

  if (!encontrado) {
    // Mensaje único: no revelar si el PIN existe, expiró el QR, etc.
    return { ok: false, error: "Código no reconocido. Intenta de nuevo." };
  }

  const admin = createAdminClient();
  const hoy = fechaMx();
  const ahora = horaMx();

  // Último movimiento de hoy: alterna entrada/salida y aplica antirrebote.
  const { data: ultimo } = await admin
    .from("registros_asistencia")
    .select("tipo, hora")
    .eq("empleado_id", encontrado.empleadoId)
    .eq("fecha", hoy)
    .order("registrado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ultimo) {
    const [h, m] = ultimo.hora.split(":").map(Number);
    const [h2, m2] = ahora.split(":").map(Number);
    if (h2 * 60 + m2 - (h * 60 + m) < MINUTOS_ANTIRREBOTE) {
      return {
        ok: false,
        error: "Ya registraste hace un momento. Espera un minuto.",
      };
    }
  }

  const tipo: "entrada" | "salida" =
    ultimo?.tipo === "entrada" ? "salida" : "entrada";

  const { error } = await admin.from("registros_asistencia").insert({
    empleado_id: encontrado.empleadoId,
    empresa_id: dispositivo.empresaId,
    metodo,
    tipo,
    fecha: hoy,
    hora: ahora,
    dispositivo_id: dispositivo.id,
  });

  if (error) {
    console.error("[checkin] error al insertar registro:", error);
    return {
      ok: false,
      error: "No se pudo guardar el registro. Intenta de nuevo.",
    };
  }

  return {
    ok: true,
    empleadoNombre: encontrado.empleadoNombre,
    tipo,
    hora: ahora.slice(0, 5),
  };
}
