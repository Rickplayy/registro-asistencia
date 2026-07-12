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
import { metodosSegunPlan, obtenerPlan } from "@/lib/planes";
import {
  deserializarPlantilla,
  esDescriptorValido,
  mejorCoincidencia,
} from "@/lib/biometria/plantilla";
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
  tipo: "kiosko" | "movil" | "lector_fisico";
  metodosHabilitados: string[];
  /** White-label (Fase 5): branding de la empresa para el kiosko. */
  logoDataUrl: string | null;
  colorMarca: string | null;
};

/** Valida la API key de un dispositivo y regresa su ficha + empresa. */
export async function validarDispositivo(
  clave: string,
): Promise<DispositivoVinculado | null> {
  if (!clave) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("dispositivos")
    .select(
      "id, empresa_id, nombre, tipo, activo, empresas(nombre, activa, config_metodos_habilitados, plan, logo_data_url, color_marca)",
    )
    .eq("api_key_hash", hashApiKey(clave))
    .eq("activo", true)
    .maybeSingle();
  if (!data) return null;
  const empresa = data.empresas as unknown as {
    nombre: string;
    activa: boolean;
    config_metodos_habilitados: string[];
    plan: string;
    logo_data_url: string | null;
    color_marca: string | null;
  };
  if (!empresa?.activa) return null;
  // El plan acota los métodos aunque la configuración tenga más (Fase 5):
  // si una empresa baja de plan, el kiosko deja de ofrecer lo no incluido.
  const plan = obtenerPlan(empresa.plan);
  const whiteLabel = plan.whiteLabel;
  return {
    id: data.id,
    empresaId: data.empresa_id,
    empresaNombre: empresa.nombre,
    nombre: data.nombre,
    tipo: data.tipo,
    metodosHabilitados: metodosSegunPlan(
      plan,
      empresa.config_metodos_habilitados ?? ["pin", "qr"],
    ),
    logoDataUrl: whiteLabel ? empresa.logo_data_url : null,
    colorMarca: whiteLabel ? empresa.color_marca : null,
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

export type EmpleadoMetodo = {
  empleadoId: string;
  empleadoNombre: string;
};

export async function buscarPorPin(
  empresaId: string,
  pin: string,
): Promise<EmpleadoMetodo | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("metodos_acceso")
    .select("empleado_id, empleados(nombre, estatus)")
    .eq("empresa_id", empresaId)
    .eq("tipo", "pin")
    .eq("activo", true)
    .eq("valor_hash_o_token", hashPin(pin, empresaId))
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

/**
 * Verificación facial 1:N. El kiosko manda SOLO el descriptor (128 números)
 * extraído en el navegador; aquí se compara contra las plantillas cifradas de
 * los empleados con consentimiento biométrico vigente (secciones 6 y 9).
 * La lectura de credenciales_biometricas queda auditada, sin excepción.
 */
async function buscarPorRostro(
  dispositivo: DispositivoVinculado,
  valorJson: string,
): Promise<EmpleadoMetodo | null> {
  let capturado: unknown;
  try {
    capturado = JSON.parse(valorJson);
  } catch {
    return null;
  }
  // Barrera anti-imagen: si no es un descriptor de 128 números, se descarta.
  if (!esDescriptorValido(capturado)) return null;

  const admin = createAdminClient();

  // Solo se procesan plantillas de empleados con consentimiento vigente.
  const { data: consentimientos } = await admin
    .from("consentimientos")
    .select("empleado_id")
    .eq("empresa_id", dispositivo.empresaId)
    .eq("tipo_dato", "biometrico_facial")
    .eq("otorgado", true)
    .is("revocado_en", null);
  const conConsentimiento = new Set(
    (consentimientos ?? []).map((c) => c.empleado_id),
  );

  const { data: credenciales } = await admin
    .from("credenciales_biometricas")
    .select("empleado_id, plantilla_cifrada, empleados(nombre, estatus)")
    .eq("empresa_id", dispositivo.empresaId)
    .eq("tipo", "facial")
    .eq("vigente", true);

  const candidatos: {
    empleadoId: string;
    nombre: string;
    plantilla: number[];
  }[] = [];
  for (const c of credenciales ?? []) {
    const emp = c.empleados as unknown as { nombre: string; estatus: string };
    if (emp?.estatus !== "activo") continue;
    if (!conConsentimiento.has(c.empleado_id)) continue;
    try {
      candidatos.push({
        empleadoId: c.empleado_id,
        nombre: emp.nombre,
        plantilla: deserializarPlantilla(decryptField(c.plantilla_cifrada)),
      });
    } catch {
      // Plantilla ilegible (llave rotada / payload alterado): se ignora.
    }
  }

  const resultado = mejorCoincidencia(
    capturado,
    candidatos.map((c) => c.plantilla),
  );
  const coincidencia =
    resultado.indice >= 0 ? candidatos[resultado.indice] : null;

  // Auditoría de la lectura (usuario_admin_id null: el actor es el kiosko).
  await admin.from("auditoria").insert({
    usuario_admin_id: null,
    empresa_id: dispositivo.empresaId,
    accion: "biometria.verificacion_checkin",
    entidad_afectada: "credenciales_biometricas",
    entidad_id: coincidencia?.empleadoId ?? null,
    detalles: {
      dispositivo_id: dispositivo.id,
      plantillas_comparadas: candidatos.length,
      coincidencia: Boolean(coincidencia),
    },
  });

  if (!coincidencia) return null;
  return {
    empleadoId: coincidencia.empleadoId,
    empleadoNombre: coincidencia.nombre,
  };
}

/**
 * Busca a un empleado activo por su número de empleado (flujo del agente
 * local, sección 3.1: el lector físico ya verificó la huella EN la terminal y
 * reporta el número del empleado; la confianza se delega al hardware).
 */
export async function buscarPorNumeroEmpleado(
  empresaId: string,
  numeroEmpleado: string,
): Promise<EmpleadoMetodo | null> {
  if (!numeroEmpleado) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("empleados")
    .select("id, nombre, estatus")
    .eq("empresa_id", empresaId)
    .eq("numero_empleado", numeroEmpleado)
    .maybeSingle();
  if (!data || data.estatus !== "activo") return null;
  return { empleadoId: data.id, empleadoNombre: data.nombre };
}

/**
 * Registra la marcación de un empleado YA identificado/verificado.
 * Núcleo compartido por el kiosko web (PIN/QR/rostro/huella) y el agente
 * local: alterna entrada/salida y aplica el antirrebote.
 */
export async function registrarMarcacion(
  dispositivo: DispositivoVinculado,
  metodo: "pin" | "qr" | "facial" | "huella",
  empleado: EmpleadoMetodo,
): Promise<ResultadoCheckin> {
  const admin = createAdminClient();
  const hoy = fechaMx();
  const ahora = horaMx();

  // Último movimiento de hoy: alterna entrada/salida y aplica antirrebote.
  const { data: ultimo } = await admin
    .from("registros_asistencia")
    .select("tipo, hora")
    .eq("empleado_id", empleado.empleadoId)
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
    empleado_id: empleado.empleadoId,
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
    empleadoNombre: empleado.empleadoNombre,
    tipo,
    hora: ahora.slice(0, 5),
  };
}

/** Registra una marcación de entrada/salida para un kiosko ya validado. */
export async function registrarCheckin(
  dispositivo: DispositivoVinculado,
  metodo: "pin" | "qr" | "facial",
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
      : metodo === "qr"
        ? await buscarPorQr(dispositivo.empresaId, valor)
        : await buscarPorRostro(dispositivo, valor);

  if (!encontrado) {
    // Mensaje único por método: no revelar si el PIN existe, expiró el QR, etc.
    return {
      ok: false,
      error:
        metodo === "facial"
          ? "Rostro no reconocido. Intenta de nuevo o usa tu PIN."
          : "Código no reconocido. Intenta de nuevo.",
    };
  }

  return registrarMarcacion(dispositivo, metodo, encontrado);
}
