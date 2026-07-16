/**
 * Cliente de datos de servicio (equivalente al service_role de Supabase) —
 * SOLO para el backend (API routes / Server Actions de confianza). Salta la
 * emulación RLS, así que jamás debe importarse en código que llegue al
 * navegador.
 */
import { crearClienteServicio, type ClienteLocal } from "@/lib/local/client";

export function createAdminClient(): ClienteLocal {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient solo puede usarse en el servidor.");
  }
  return crearClienteServicio();
}
