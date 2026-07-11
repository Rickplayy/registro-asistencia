"use server";

/**
 * Gestión de dispositivos (kioskos). La clave de vinculación se muestra UNA
 * sola vez al crearla; en la base solo vive su hash SHA-256.
 */
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/db/server";
import { requerirAdmin } from "@/lib/auth/session";
import { auditar } from "@/lib/db/auditoria";
import { hashApiKey } from "@/lib/asistencia/checkin";

export type AltaDispositivoResult =
  | { ok: true; clave: string; nombre: string }
  | { ok: false; error: string }
  | undefined;

export async function crearDispositivo(
  _prev: AltaDispositivoResult,
  formData: FormData,
): Promise<AltaDispositivoResult> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) {
    return { ok: false, error: "Tu perfil no está ligado a una empresa." };
  }

  const nombre = String(formData.get("nombre") ?? "").trim();
  const ubicacion = String(formData.get("ubicacion") ?? "").trim();
  const tipoCrudo = String(formData.get("tipo") ?? "kiosko");
  // Fase 3: además de kioskos web, lectores físicos operados por el agente local.
  const tipo = tipoCrudo === "lector_fisico" ? "lector_fisico" : "kiosko";
  if (!nombre) return { ok: false, error: "Ponle un nombre al dispositivo." };

  const prefijo = tipo === "lector_fisico" ? "RA-LECTOR" : "RA-KIOSKO";
  const clave = `${prefijo}-${randomBytes(24).toString("hex")}`;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dispositivos")
    .insert({
      empresa_id: perfil.empresa_id,
      tipo,
      nombre,
      ubicacion: ubicacion || null,
      api_key_hash: hashApiKey(clave),
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error:
        "No se pudo crear el dispositivo (solo el administrador de la empresa puede hacerlo).",
    };
  }

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: "dispositivo.alta",
    entidad: "dispositivos",
    entidadId: data.id,
    detalles: { nombre, tipo },
  });

  revalidatePath("/dispositivos");
  return { ok: true, clave, nombre };
}

export async function desactivarDispositivo(
  dispositivoId: string,
): Promise<{ error?: string }> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) return { error: "Perfil sin empresa." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("dispositivos")
    .update({ activo: false })
    .eq("id", dispositivoId)
    .eq("empresa_id", perfil.empresa_id);

  if (error) return { error: "No se pudo desactivar." };

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: "dispositivo.desactivacion",
    entidad: "dispositivos",
    entidadId: dispositivoId,
  });

  revalidatePath("/dispositivos");
  return {};
}
