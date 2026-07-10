"use server";

/**
 * Alta de empresa (onboarding multi-tenant).
 *
 * Las empresas y los usuarios admin NUNCA se crean desde el cliente (regla de
 * RLS de Fase 0): este server action usa service_role, valida todo en el
 * servidor y hace rollback si algún paso falla.
 */
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { auditar } from "@/lib/db/auditoria";

export type RegistroEmpresaResult = { error: string } | undefined;

export async function registrarEmpresa(
  _prev: RegistroEmpresaResult,
  formData: FormData,
): Promise<RegistroEmpresaResult> {
  const empresaNombre = String(formData.get("empresa_nombre") ?? "").trim();
  const empresaRfc = String(formData.get("empresa_rfc") ?? "")
    .trim()
    .toUpperCase();
  const adminNombre = String(formData.get("admin_nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!empresaNombre || !adminNombre || !email || !password) {
    return { error: "Completa todos los campos obligatorios." };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (empresaRfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/.test(empresaRfc)) {
    return { error: "El RFC de la empresa no tiene un formato válido." };
  }

  const admin = createAdminClient();

  // 1) Cuenta de acceso (Supabase Auth)
  const { data: cuenta, error: errCuenta } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (errCuenta || !cuenta?.user) {
    const duplicado =
      errCuenta?.message?.toLowerCase().includes("already") ||
      errCuenta?.code === "email_exists";
    return {
      error: duplicado
        ? "Ya existe una cuenta con ese correo. Inicia sesión."
        : "No se pudo crear la cuenta. Intenta de nuevo.",
    };
  }

  // 2) Empresa (tenant)
  const { data: empresa, error: errEmpresa } = await admin
    .from("empresas")
    .insert({ nombre: empresaNombre, rfc_empresa: empresaRfc || null })
    .select("id")
    .single();
  if (errEmpresa || !empresa) {
    await admin.auth.admin.deleteUser(cuenta.user.id);
    return { error: "No se pudo crear la empresa. Intenta de nuevo." };
  }

  // 3) Perfil administrativo (admin_empresa)
  const { data: perfil, error: errPerfil } = await admin
    .from("usuarios_admin")
    .insert({
      auth_user_id: cuenta.user.id,
      empresa_id: empresa.id,
      nombre: adminNombre,
      email,
      rol: "admin_empresa",
    })
    .select("id")
    .single();
  if (errPerfil || !perfil) {
    await admin.from("empresas").delete().eq("id", empresa.id);
    await admin.auth.admin.deleteUser(cuenta.user.id);
    return { error: "No se pudo crear el perfil administrativo." };
  }

  await auditar(admin, {
    usuarioAdminId: perfil.id,
    empresaId: empresa.id,
    accion: "empresa.alta",
    entidad: "empresas",
    entidadId: empresa.id,
    detalles: { nombre: empresaNombre },
  });

  // 4) Sesión iniciada de una vez
  const supabase = await createClient();
  const { error: errLogin } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (errLogin) {
    redirect("/login");
  }
  redirect("/dashboard");
}
