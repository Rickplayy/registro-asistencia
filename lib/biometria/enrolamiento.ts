"use server";

/**
 * Server Actions de enrolamiento facial (Fase 2).
 *
 * Reglas inquebrantables que aplican aquí (secciones 2.2 y 6 del documento):
 *  - JAMÁS llega ni se guarda una imagen: el cliente envía solo descriptores
 *    de 128 números y `esDescriptorValido` rechaza cualquier otra cosa.
 *  - Sin consentimiento `biometrico_facial` vigente en `consentimientos`,
 *    NO se inserta credencial — la verificación es en servidor, no en UI.
 *  - La plantilla se cifra (AES-256-GCM, lib/crypto) antes de tocar la base.
 *  - Todo acceso a credenciales_biometricas queda en auditoría (además del
 *    trigger de BD que cubre las escrituras).
 */
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/db/server";
import { requerirAdmin } from "@/lib/auth/session";
import { auditar } from "@/lib/db/auditoria";
import { encryptField } from "@/lib/crypto";
import {
  CAPTURAS_ENROLAMIENTO,
  esDescriptorValido,
  promediarDescriptores,
  serializarPlantilla,
} from "@/lib/biometria/plantilla";

/** Versión del aviso de privacidad específico de datos biométricos. */
const VERSION_AVISO_BIOMETRICO = "v1.0-biometrico-2026-07";

async function ipDelCliente(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : null;
}

export type EnrolamientoResult = { ok: true } | { ok: false; error: string };

/**
 * Enrola el rostro de un empleado.
 *
 * @param capturas   Descriptores faciales (128 números c/u) extraídos EN EL
 *                   NAVEGADOR por face-api.js; nunca imágenes.
 * @param otorgaConsentimiento  El operador de RH marcó la casilla de
 *                   consentimiento expreso y por escrito del empleado. Si es
 *                   false y no existe un consentimiento previo vigente, se
 *                   rechaza el enrolamiento.
 */
export async function enrolarRostro(
  empleadoId: string,
  capturas: unknown[],
  otorgaConsentimiento: boolean,
): Promise<EnrolamientoResult> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) {
    return { ok: false, error: "Tu perfil no está ligado a una empresa." };
  }

  // Barrera anti-imagen: solo descriptores válidos, en cantidad razonable.
  if (
    !Array.isArray(capturas) ||
    capturas.length === 0 ||
    capturas.length > CAPTURAS_ENROLAMIENTO ||
    !capturas.every(esDescriptorValido)
  ) {
    return {
      ok: false,
      error:
        "Las capturas recibidas no son plantillas faciales válidas. Intenta de nuevo.",
    };
  }
  const descriptores = capturas as number[][];

  const supabase = await createClient();

  // El empleado debe existir en MI empresa y estar activo.
  const { data: empleado } = await supabase
    .from("empleados")
    .select("id, nombre, estatus")
    .eq("id", empleadoId)
    .eq("empresa_id", perfil.empresa_id)
    .maybeSingle();
  if (!empleado) return { ok: false, error: "Empleado no encontrado." };
  if (empleado.estatus !== "activo") {
    return { ok: false, error: "Solo se puede enrolar a empleados activos." };
  }

  // 1) Registrar el consentimiento si se otorga en este momento.
  if (otorgaConsentimiento) {
    const { error: errConsent } = await supabase
      .from("consentimientos")
      .insert({
        empleado_id: empleadoId,
        empresa_id: perfil.empresa_id,
        tipo_dato: "biometrico_facial",
        version_aviso_privacidad: VERSION_AVISO_BIOMETRICO,
        ip: await ipDelCliente(),
        otorgado: true,
      });
    if (errConsent) {
      return { ok: false, error: "No se pudo registrar el consentimiento." };
    }
    await auditar(supabase, {
      usuarioAdminId: perfil.id,
      empresaId: perfil.empresa_id,
      accion: "biometria.consentimiento_facial",
      entidad: "consentimientos",
      entidadId: empleadoId,
      detalles: { version: VERSION_AVISO_BIOMETRICO },
    });
  }

  // 2) Verificación BLOQUEANTE en servidor: sin consentimiento vigente no hay
  //    enrolamiento, sin importar lo que diga la UI.
  const { data: consentimiento } = await supabase
    .from("consentimientos")
    .select("id")
    .eq("empleado_id", empleadoId)
    .eq("empresa_id", perfil.empresa_id)
    .eq("tipo_dato", "biometrico_facial")
    .eq("otorgado", true)
    .is("revocado_en", null)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!consentimiento) {
    return {
      ok: false,
      error:
        "No existe consentimiento expreso para datos biométricos de este empleado (LFPDPPP). Regístralo antes de enrolar.",
    };
  }

  // 3) Plantilla: promedio de capturas → serializar → cifrar (AES-256-GCM).
  const plantillaCifrada = encryptField(
    serializarPlantilla(promediarDescriptores(descriptores)),
  );

  // 4) Re-enrolamiento: la credencial anterior se desactiva, nunca se pisa.
  const { error: errDesactivar } = await supabase
    .from("credenciales_biometricas")
    .update({ vigente: false })
    .eq("empleado_id", empleadoId)
    .eq("empresa_id", perfil.empresa_id)
    .eq("tipo", "facial")
    .eq("vigente", true);
  if (errDesactivar) {
    return { ok: false, error: "No se pudo actualizar la credencial previa." };
  }

  const { error: errInsert } = await supabase
    .from("credenciales_biometricas")
    .insert({
      empleado_id: empleadoId,
      empresa_id: perfil.empresa_id,
      tipo: "facial",
      plantilla_cifrada: plantillaCifrada,
      vigente: true,
    });
  if (errInsert) {
    return { ok: false, error: "No se pudo guardar la plantilla facial." };
  }

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: "biometria.enrolamiento_facial",
    entidad: "credenciales_biometricas",
    entidadId: empleadoId,
    detalles: { capturas: descriptores.length },
  });

  revalidatePath(`/empleados/${empleadoId}`);
  return { ok: true };
}

/** Revoca (desactiva) la credencial facial vigente de un empleado. */
export async function revocarRostro(
  empleadoId: string,
): Promise<EnrolamientoResult> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) {
    return { ok: false, error: "Tu perfil no está ligado a una empresa." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credenciales_biometricas")
    .update({ vigente: false })
    .eq("empleado_id", empleadoId)
    .eq("empresa_id", perfil.empresa_id)
    .eq("tipo", "facial")
    .eq("vigente", true)
    .select("id");

  if (error) return { ok: false, error: "No se pudo revocar la credencial." };
  if (!data || data.length === 0) {
    return { ok: false, error: "El empleado no tiene rostro enrolado." };
  }

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: "biometria.revocacion_facial",
    entidad: "credenciales_biometricas",
    entidadId: empleadoId,
  });

  revalidatePath(`/empleados/${empleadoId}`);
  return { ok: true };
}
