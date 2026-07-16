/**
 * Modo local: la base NUNCA se expone al navegador (regla 5 de
 * ARCHITECTURE.md). No existe un cliente de datos de navegador: todas las
 * lecturas/escrituras pasan por Server Components, Server Actions o API
 * routes con lib/db/server o lib/db/admin.
 */
export function createClient(): never {
  throw new Error(
    "En modo local no hay cliente de datos en el navegador: usa lib/db/server (sesión) o lib/db/admin (servicio) desde el servidor.",
  );
}
