/**
 * Cliente de datos para Server Components, Server Actions y Route Handlers.
 * Modo local: SQLite + auth propia (lib/local); la sesión viaja en la cookie
 * httpOnly ra_session y el acceso queda acotado por la emulación RLS.
 */
import { cookies } from "next/headers";

import { crearClienteSesion, type ClienteLocal } from "@/lib/local/client";

export async function createClient(): Promise<ClienteLocal> {
  const cookieStore = await cookies();

  return crearClienteSesion({
    get(nombre) {
      return cookieStore.get(nombre)?.value;
    },
    set(nombre, valor, opciones) {
      try {
        cookieStore.set(nombre, valor, opciones);
      } catch {
        // Llamado desde un Server Component: solo el proxy/actions pueden escribir cookies.
      }
    },
  });
}
