"use server";

/** Actualización de la configuración de la empresa (solo admin_empresa vía RLS). */
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/db/server";
import { requerirAdmin } from "@/lib/auth/session";
import { auditar } from "@/lib/db/auditoria";

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

  // Métodos activables: PIN, QR y facial (Fase 2). Huella llega en Fase 3.
  const metodos = ["pin", "qr", "facial"].filter(
    (m) => formData.get(`metodo_${m}`) === "on",
  );
  if (metodos.length === 0) {
    return { error: "Habilita al menos un método de registro." };
  }

  const supabase = await createClient();
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
