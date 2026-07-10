"use server";

/**
 * Server Actions de empleados (Fase 1).
 *
 * Reglas que aplican aquí:
 *  - CURP, RFC y fecha de nacimiento se cifran ANTES de tocar la base.
 *  - Toda alta registra consentimiento de datos personales (LFPDPPP).
 *  - El PIN solo se guarda como hash; el secreto QR solo cifrado.
 *  - Cada alta/cambio/baja escribe en auditoría.
 *
 * Los inserts usan el cliente de sesión (RLS): si el usuario no es RH/admin
 * de la empresa, la base rechaza la operación aunque el código fallara.
 */
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/db/server";
import { requerirAdmin } from "@/lib/auth/session";
import { auditar } from "@/lib/db/auditoria";
import { encryptNullable } from "@/lib/crypto";
import { generarPin, hashPin } from "@/lib/auth/pin";
import { generarSecretoQr } from "@/lib/auth/qr";
import { encryptField } from "@/lib/crypto";

/** Versión del aviso de privacidad aceptado en el alta (se guarda como evidencia). */
const VERSION_AVISO_PRIVACIDAD = "v1.0-2026-07";

const RE_CURP = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d$/;
const RE_RFC_PF = /^[A-ZÑ&]{4}\d{6}[A-Z\d]{3}$/;

export type AltaEmpleadoResult =
  | { ok: true; empleadoId: string; pin: string }
  | { ok: false; error: string }
  | undefined;

async function ipDelCliente(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : null;
}

export async function crearEmpleado(
  _prev: AltaEmpleadoResult,
  formData: FormData,
): Promise<AltaEmpleadoResult> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) {
    return { ok: false, error: "Tu perfil no está ligado a una empresa." };
  }

  const nombre = String(formData.get("nombre") ?? "").trim();
  const puesto = String(formData.get("puesto") ?? "").trim();
  const numeroEmpleado = String(formData.get("numero_empleado") ?? "").trim();
  const curp = String(formData.get("curp") ?? "")
    .trim()
    .toUpperCase();
  const rfc = String(formData.get("rfc") ?? "")
    .trim()
    .toUpperCase();
  const fechaNacimiento = String(formData.get("fecha_nacimiento") ?? "").trim();
  const sexo = String(formData.get("sexo") ?? "").trim() || null;
  const fechaIngreso = String(formData.get("fecha_ingreso") ?? "").trim();
  const consentimiento = formData.get("consentimiento") === "on";

  if (!nombre) return { ok: false, error: "El nombre es obligatorio." };
  if (!consentimiento) {
    return {
      ok: false,
      error:
        "Debes confirmar que el empleado otorgó su consentimiento para el tratamiento de sus datos personales.",
    };
  }
  if (curp && !RE_CURP.test(curp)) {
    return {
      ok: false,
      error: "La CURP no tiene un formato válido (18 caracteres).",
    };
  }
  if (rfc && !RE_RFC_PF.test(rfc)) {
    return {
      ok: false,
      error: "El RFC no tiene un formato válido (13 caracteres).",
    };
  }

  const supabase = await createClient();

  // 1) Empleado con campos sensibles cifrados
  const { data: empleado, error: errEmpleado } = await supabase
    .from("empleados")
    .insert({
      empresa_id: perfil.empresa_id,
      nombre,
      puesto: puesto || null,
      numero_empleado: numeroEmpleado || null,
      curp_cifrado: encryptNullable(curp),
      rfc_cifrado: encryptNullable(rfc),
      fecha_nacimiento_cifrada: encryptNullable(fechaNacimiento),
      sexo,
      fecha_ingreso: fechaIngreso || null,
    })
    .select("id")
    .single();

  if (errEmpleado || !empleado) {
    const duplicado = errEmpleado?.code === "23505";
    return {
      ok: false,
      error: duplicado
        ? "Ya existe un empleado con ese número en tu empresa."
        : "No se pudo guardar el empleado.",
    };
  }

  // 2) Consentimiento de datos personales (evidencia legal, INSERT-only)
  const { error: errConsent } = await supabase.from("consentimientos").insert({
    empleado_id: empleado.id,
    empresa_id: perfil.empresa_id,
    tipo_dato: "datos_personales",
    version_aviso_privacidad: VERSION_AVISO_PRIVACIDAD,
    ip: await ipDelCliente(),
    otorgado: true,
  });
  if (errConsent) {
    // Sin consentimiento no dejamos datos personales guardados: rollback.
    await supabase.from("empleados").delete().eq("id", empleado.id);
    return { ok: false, error: "No se pudo registrar el consentimiento." };
  }

  // 3) Métodos de acceso: PIN (hash) + QR (secreto cifrado).
  //    Reintenta si el PIN generado choca con uno existente (índice único).
  let pin = "";
  let pinCreado = false;
  for (let intento = 0; intento < 5 && !pinCreado; intento++) {
    pin = generarPin();
    const { error: errPin } = await supabase.from("metodos_acceso").insert({
      empleado_id: empleado.id,
      empresa_id: perfil.empresa_id,
      tipo: "pin",
      valor_hash_o_token: hashPin(pin, perfil.empresa_id),
    });
    if (!errPin) pinCreado = true;
    else if (errPin.code !== "23505") break;
  }

  const { error: errQr } = await supabase.from("metodos_acceso").insert({
    empleado_id: empleado.id,
    empresa_id: perfil.empresa_id,
    tipo: "qr",
    valor_hash_o_token: encryptField(generarSecretoQr()),
  });

  if (!pinCreado || errQr) {
    return {
      ok: false,
      error:
        "El empleado se creó pero falló la generación de sus métodos de acceso. Ábrelo y regenera su PIN/QR.",
    };
  }

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: "empleado.alta",
    entidad: "empleados",
    entidadId: empleado.id,
    detalles: { nombre, consentimiento: VERSION_AVISO_PRIVACIDAD },
  });

  revalidatePath("/empleados");
  return { ok: true, empleadoId: empleado.id, pin };
}

export type AccionEmpleadoResult = { ok?: boolean; error?: string } | undefined;

export async function actualizarEmpleado(
  empleadoId: string,
  _prev: AccionEmpleadoResult,
  formData: FormData,
): Promise<AccionEmpleadoResult> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) return { error: "Perfil sin empresa." };

  const nombre = String(formData.get("nombre") ?? "").trim();
  const curp = String(formData.get("curp") ?? "")
    .trim()
    .toUpperCase();
  const rfc = String(formData.get("rfc") ?? "")
    .trim()
    .toUpperCase();
  const fechaNacimiento = String(formData.get("fecha_nacimiento") ?? "").trim();

  if (!nombre) return { error: "El nombre es obligatorio." };
  if (curp && !RE_CURP.test(curp))
    return { error: "CURP con formato inválido." };
  if (rfc && !RE_RFC_PF.test(rfc))
    return { error: "RFC con formato inválido." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("empleados")
    .update({
      nombre,
      puesto: String(formData.get("puesto") ?? "").trim() || null,
      numero_empleado:
        String(formData.get("numero_empleado") ?? "").trim() || null,
      sexo: String(formData.get("sexo") ?? "").trim() || null,
      fecha_ingreso: String(formData.get("fecha_ingreso") ?? "").trim() || null,
      curp_cifrado: encryptNullable(curp),
      rfc_cifrado: encryptNullable(rfc),
      fecha_nacimiento_cifrada: encryptNullable(fechaNacimiento),
    })
    .eq("id", empleadoId)
    .eq("empresa_id", perfil.empresa_id);

  if (error) return { error: "No se pudo actualizar el empleado." };

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: "empleado.actualizacion",
    entidad: "empleados",
    entidadId: empleadoId,
  });

  revalidatePath("/empleados");
  revalidatePath(`/empleados/${empleadoId}`);
  return { ok: true };
}

export async function cambiarEstatusEmpleado(
  empleadoId: string,
  nuevoEstatus: "activo" | "baja",
): Promise<AccionEmpleadoResult> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) return { error: "Perfil sin empresa." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("empleados")
    .update({ estatus: nuevoEstatus })
    .eq("id", empleadoId)
    .eq("empresa_id", perfil.empresa_id);

  if (error) return { error: "No se pudo cambiar el estatus." };

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: nuevoEstatus === "baja" ? "empleado.baja" : "empleado.reactivacion",
    entidad: "empleados",
    entidadId: empleadoId,
  });

  revalidatePath("/empleados");
  revalidatePath(`/empleados/${empleadoId}`);
  return { ok: true };
}

export type RegenerarPinResult =
  { ok: true; pin: string } | { ok: false; error: string };

export async function regenerarPin(
  empleadoId: string,
): Promise<RegenerarPinResult> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) return { ok: false, error: "Perfil sin empresa." };

  const supabase = await createClient();

  for (let intento = 0; intento < 5; intento++) {
    const pin = generarPin();
    const { data, error } = await supabase
      .from("metodos_acceso")
      .update({ valor_hash_o_token: hashPin(pin, perfil.empresa_id) })
      .eq("empleado_id", empleadoId)
      .eq("empresa_id", perfil.empresa_id)
      .eq("tipo", "pin")
      .eq("activo", true)
      .select("id");

    if (!error && data && data.length > 0) {
      await auditar(supabase, {
        usuarioAdminId: perfil.id,
        empresaId: perfil.empresa_id,
        accion: "empleado.regeneracion_pin",
        entidad: "metodos_acceso",
        entidadId: empleadoId,
      });
      return { ok: true, pin };
    }
    if (error && error.code !== "23505") break;
  }

  // Puede no existir el método (alta incompleta): créalo.
  const pin = generarPin();
  const { error: errInsert } = await supabase.from("metodos_acceso").insert({
    empleado_id: empleadoId,
    empresa_id: perfil.empresa_id,
    tipo: "pin",
    valor_hash_o_token: hashPin(pin, perfil.empresa_id),
  });
  if (errInsert) return { ok: false, error: "No se pudo regenerar el PIN." };

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: "empleado.regeneracion_pin",
    entidad: "metodos_acceso",
    entidadId: empleadoId,
  });
  return { ok: true, pin };
}
