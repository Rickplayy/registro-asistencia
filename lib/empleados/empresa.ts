"use server";

/** Actualización de la configuración de la empresa (solo admin_empresa vía RLS). */
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/db/server";
import { requerirAdmin } from "@/lib/auth/session";
import { auditar } from "@/lib/db/auditoria";
import { obtenerPlan } from "@/lib/planes";

export type ConfigEmpresaResult = { ok?: boolean; error?: string } | undefined;

export async function actualizarEmpresa(
  _prev: ConfigEmpresaResult,
  formData: FormData,
): Promise<ConfigEmpresaResult> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) return { error: "Perfil sin empresa." };
  if (perfil.rol !== "admin_empresa" && perfil.rol !== "super_admin") {
    return {
      error:
        "Solo el administrador de la empresa puede cambiar la configuración.",
    };
  }

  const nombre = String(formData.get("nombre") ?? "").trim();
  const rfc = String(formData.get("rfc_empresa") ?? "")
    .trim()
    .toUpperCase();
  const horaEntrada = String(formData.get("hora_entrada") ?? "09:00");
  const horaSalida = String(formData.get("hora_salida") ?? "18:00");
  const tolerancia = Number(formData.get("tolerancia") ?? 15);

  if (!nombre) return { error: "El nombre de la empresa es obligatorio." };
  if (!/^\d{2}:\d{2}$/.test(horaEntrada) || !/^\d{2}:\d{2}$/.test(horaSalida)) {
    return { error: "Horario inválido." };
  }
  if (!Number.isInteger(tolerancia) || tolerancia < 0 || tolerancia > 120) {
    return { error: "La tolerancia debe ser un número de 0 a 120 minutos." };
  }

  // Los 4 métodos de la sección 5 del documento maestro (Fase 3 completa).
  const metodos = ["pin", "qr", "facial", "huella"].filter(
    (m) => formData.get(`metodo_${m}`) === "on",
  );
  if (metodos.length === 0) {
    return { error: "Habilita al menos un método de registro." };
  }

  const supabase = await createClient();

  // Enforcement del plan (Fase 5): métodos fuera del plan se rechazan en
  // servidor aunque la UI se manipule.
  const { data: empresaActual } = await supabase
    .from("empresas")
    .select("plan")
    .maybeSingle();
  const plan = obtenerPlan(empresaActual?.plan);
  const fueraDePlan = metodos.filter(
    (m) => !(plan.metodosPermitidos as string[]).includes(m),
  );
  if (fueraDePlan.length > 0) {
    return {
      error: `Tu plan ${plan.nombre} no incluye: ${fueraDePlan.join(", ")}. Mejora tu plan en Plan y facturación.`,
    };
  }
  const { error } = await supabase
    .from("empresas")
    .update({
      nombre,
      rfc_empresa: rfc || null,
      hora_entrada: horaEntrada,
      hora_salida: horaSalida,
      tolerancia_retardo_minutos: tolerancia,
      config_metodos_habilitados: metodos,
    })
    .eq("id", perfil.empresa_id);

  if (error) return { error: "No se pudo guardar la configuración." };

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: "empresa.actualizacion",
    entidad: "empresas",
    entidadId: perfil.empresa_id,
    detalles: { metodos, tolerancia },
  });

  revalidatePath("/configuracion");
  return { ok: true };
}

/** Tipos de imagen aceptados para el logo white-label. */
const MIMES_LOGO = ["image/png", "image/jpeg", "image/svg+xml"];
/** Tamaño máximo del data URL (~150 KB de imagen). */
const MAX_LOGO_BYTES = 200_000;

/**
 * White-label (Fase 5): logo y color de marca de la empresa.
 * Disponible solo en planes con whiteLabel; validado en servidor.
 */
export async function guardarMarca(
  _prev: ConfigEmpresaResult,
  formData: FormData,
): Promise<ConfigEmpresaResult> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) return { error: "Perfil sin empresa." };
  if (perfil.rol !== "admin_empresa" && perfil.rol !== "super_admin") {
    return {
      error: "Solo el administrador de la empresa puede cambiar la marca.",
    };
  }

  const supabase = await createClient();
  const { data: empresaActual } = await supabase
    .from("empresas")
    .select("plan")
    .maybeSingle();
  const plan = obtenerPlan(empresaActual?.plan);
  if (!plan.whiteLabel) {
    return {
      error: `El plan ${plan.nombre} no incluye personalización de marca. Mejora a Pro o Enterprise.`,
    };
  }

  const color = String(formData.get("color_marca") ?? "").trim();
  const logo = String(formData.get("logo_data_url") ?? "").trim();
  const quitarLogo = formData.get("quitar_logo") === "on";

  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return { error: "El color debe ser hexadecimal (#RRGGBB)." };
  }
  if (logo) {
    if (logo.length > MAX_LOGO_BYTES) {
      return { error: "El logo es demasiado grande (máximo ~150 KB)." };
    }
    const mime = logo.match(/^data:([^;]+);base64,/)?.[1];
    if (!mime || !MIMES_LOGO.includes(mime)) {
      return { error: "El logo debe ser PNG, JPEG o SVG." };
    }
  }

  const cambios: Record<string, string | null> = {};
  if (color) cambios.color_marca = color;
  if (logo) cambios.logo_data_url = logo;
  if (quitarLogo) cambios.logo_data_url = null;
  if (Object.keys(cambios).length === 0) {
    return { error: "No hay cambios de marca que guardar." };
  }

  const { error } = await supabase
    .from("empresas")
    .update(cambios)
    .eq("id", perfil.empresa_id);
  if (error) return { error: "No se pudo guardar la marca." };

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: "empresa.actualizacion",
    entidad: "empresas",
    entidadId: perfil.empresa_id,
    detalles: {
      marca: true,
      color: color || undefined,
      logo: logo ? "actualizado" : quitarLogo ? "eliminado" : undefined,
    },
  });

  revalidatePath("/configuracion");
  return { ok: true };
}
