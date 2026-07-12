/**
 * Proveedor de pagos SIMULADO — para desarrollo y demos sin cuenta de Stripe.
 *
 * Emite un "token de checkout" cifrado (AES-256-GCM, lib/crypto) con la
 * empresa, el plan y una caducidad corta; la página /plan/confirmar lo valida
 * en servidor contra la sesión del admin antes de activar. Así el flujo
 * completo (elegir plan → checkout → activación → suscripción activa) es
 * idéntico al real, sin tocar dinero.
 */
import { decryptField, encryptField } from "@/lib/crypto";
import type { ProveedorPagos, SolicitudCheckout } from "./tipos";

const TOKEN_TTL_MS = 15 * 60 * 1000;

type TokenCheckout = {
  empresaId: string;
  plan: string;
  expira: number;
};

export const proveedorSimulado: ProveedorPagos = {
  id: "simulado",

  async crearCheckout(s: SolicitudCheckout): Promise<{ url: string }> {
    const token = encryptField(
      JSON.stringify({
        empresaId: s.empresaId,
        plan: s.plan.id,
        expira: Date.now() + TOKEN_TTL_MS,
      } satisfies TokenCheckout),
    );
    return {
      url: `${s.urlBase}/plan/confirmar?token=${encodeURIComponent(token)}`,
    };
  },
};

/** Valida el token del checkout simulado. Null si es inválido/expirado. */
export function abrirTokenCheckout(token: string): TokenCheckout | null {
  try {
    const datos = JSON.parse(decryptField(token)) as TokenCheckout;
    if (Date.now() > datos.expira) return null;
    return datos;
  } catch {
    return null;
  }
}
