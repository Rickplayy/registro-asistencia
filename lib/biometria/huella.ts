"use server";

/**
 * Server Actions de huella (WebAuthn) para RH — Fase 3.
 *
 * RH registra aquí el consentimiento expreso (LFPDPPP) y puede revocar las
 * credenciales; el enrolamiento del passkey ocurre EN el kiosko, porque la
 * credencial WebAuthn vive en el aparato donde el empleado ficha.
 */
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { requerirAdmin } from "@/lib/auth/session";
import { auditar } from "@/lib/db/auditoria";

/** Versión del aviso de privacidad específico de huella digital. */
const VERSION_AVISO_HUELLA = "v1.0-huella-2026-07";

export type AccionHuellaResult = { ok: true } | { ok: false; error: string };

async function ipDelCliente(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : null;
}

/** Registra el consentimiento expreso de huella (evidencia con fecha e IP). */
export async function registrarConsentimientoHuella(
  empleadoId: string,
): Promise<AccionHuellaResult> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) {
    return { ok: false, error: "Tu perfil no está ligado a una empresa." };
  }

  const supabase = await createClient();

  const { data: empleado } = await supabase
    .from("empleados")
    .select("id, estatus")
    .eq("id", empleadoId)
    .eq("empresa_id", perfil.empresa_id)
    .maybeSingle();
  if (!empleado) return { ok: false, error: "Empleado no encontrado." };
  if (empleado.estatus !== "activo") {
    return { ok: false, error: "Solo empleados activos." };
  }

  const { error } = await supabase.from("consentimientos").insert({
    empleado_id: empleadoId,
    empresa_id: perfil.empresa_id,
    tipo_dato: "biometrico_huella",
    version_aviso_privacidad: VERSION_AVISO_HUELLA,
    ip: await ipDelCliente(),
    otorgado: true,
  });
  if (error) {
    return { ok: false, error: "No se pudo registrar el consentimiento." };
  }

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: "biometria.consentimiento_huella",
    entidad: "consentimientos",
    entidadId: empleadoId,
    detalles: { version: VERSION_AVISO_HUELLA },
  });

  revalidatePath(`/empleados/${empleadoId}`);
  return { ok: true };
}

/**
 * Revoca la huella del empleado: desactiva sus credenciales WebAuthn y marca
 * el consentimiento como revocado (derecho ARCO de cancelación/oposición).
 */
export async function revocarHuella(
  empleadoId: string,
): Promise<AccionHuellaResult> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) {
    return { ok: false, error: "Tu perfil no está ligado a una empresa." };
  }

  const supabase = await createClient();

  // 1) Credenciales fuera (cliente de sesión: RLS acota a MI empresa).
  const { error: errCred } = await supabase
    .from("credenciales_webauthn")
    .update({ vigente: false })
    .eq("empleado_id", empleadoId)
    .eq("empresa_id", perfil.empresa_id)
    .eq("vigente", true);
  if (errCred) {
    return { ok: false, error: "No se pudieron revocar las credenciales." };
  }

  // 2) Consentimiento revocado. Los clientes no tienen UPDATE sobre
  //    consentimientos (evidencia legal inmutable): la revocación ARCO pasa
  //    por el backend, tras verificar arriba que el empleado es de MI empresa.
  const admin = createAdminClient();
  await admin
    .from("consentimientos")
    .update({ revocado_en: new Date().toISOString() })
    .eq("empleado_id", empleadoId)
    .eq("empresa_id", perfil.empresa_id)
    .eq("tipo_dato", "biometrico_huella")
    .is("revocado_en", null);

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: "biometria.revocacion_huella",
    entidad: "credenciales_webauthn",
    entidadId: empleadoId,
  });

  revalidatePath(`/empleados/${empleadoId}`);
  return { ok: true };
}
