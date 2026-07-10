"use server";

/**
 * Server Actions de autenticación administrativa (sección 8.1).
 * El login de admins/RH va por Supabase Auth y queda separado por completo
 * del flujo de check-in de empleados en el kiosko.
 */
import { redirect } from "next/navigation";

import { createClient } from "@/lib/db/server";

export type AuthResult = { error: string } | undefined;

export async function iniciarSesion(
  _prevState: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Ingresa tu correo y contraseña." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Mensaje genérico: no revelar si el correo existe o no.
    return {
      error: "Credenciales incorrectas. Verifica tu correo y contraseña.",
    };
  }

  redirect("/dashboard");
}

export type RecuperacionResult = { error?: string; ok?: boolean } | undefined;

export async function enviarRecuperacion(
  _prevState: RecuperacionResult,
  formData: FormData,
): Promise<RecuperacionResult> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Ingresa tu correo electrónico." };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email);

  // Siempre respondemos éxito para no revelar qué correos existen.
  return { ok: true };
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
