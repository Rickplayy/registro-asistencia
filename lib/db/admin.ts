/**
 * Cliente Supabase con service_role — SOLO para el backend (API routes /
 * Server Actions de confianza). Salta RLS, así que jamás debe importarse en
 * código que llegue al navegador ni exponerse su llave en NEXT_PUBLIC_*.
 */
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient solo puede usarse en el servidor.");
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
