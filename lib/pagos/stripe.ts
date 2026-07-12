/**
 * Proveedor Stripe (Checkout hospedado, cobro recurrente mensual).
 *
 * Se usa la API REST directamente (sin SDK): una sola llamada form-encoded.
 * La tarjeta la captura la página de Stripe — nunca pasa por este backend
 * (regla inquebrantable de la fase). Activo solo si STRIPE_SECRET_KEY existe.
 *
 * La activación de la suscripción llega por el webhook
 * (app/api/pagos/webhook), verificado con STRIPE_WEBHOOK_SECRET.
 */
import type { ProveedorPagos, SolicitudCheckout } from "./tipos";

export const proveedorStripe: ProveedorPagos = {
  id: "stripe",

  async crearCheckout(s: SolicitudCheckout): Promise<{ url: string }> {
    const clave = process.env.STRIPE_SECRET_KEY;
    if (!clave) throw new Error("Falta STRIPE_SECRET_KEY en el entorno.");

    const params = new URLSearchParams({
      mode: "subscription",
      customer_email: s.adminEmail,
      success_url: `${s.urlBase}/plan?exito=1`,
      cancel_url: `${s.urlBase}/plan?cancelado=1`,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "mxn",
      "line_items[0][price_data][unit_amount]": String(
        s.plan.precioMensualMxn * 100,
      ),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][price_data][product_data][name]": `Registro de Asistencia · Plan ${s.plan.nombre}`,
      "metadata[empresa_id]": s.empresaId,
      "metadata[plan]": s.plan.id,
      "subscription_data[metadata][empresa_id]": s.empresaId,
      "subscription_data[metadata][plan]": s.plan.id,
    });

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clave}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const data = (await res.json()) as {
      url?: string;
      error?: { message?: string };
    };
    if (!res.ok || !data.url) {
      throw new Error(
        data.error?.message ?? "Stripe no devolvió URL de checkout.",
      );
    }
    return { url: data.url };
  },
};

/**
 * Verifica la firma `Stripe-Signature` de un webhook (HMAC-SHA256 de
 * "<timestamp>.<payload>" con el secreto del endpoint). Regresa true si es
 * auténtica y reciente (< 5 min).
 */
export async function verificarFirmaStripe(
  payload: string,
  encabezadoFirma: string | null,
  secreto: string,
): Promise<boolean> {
  if (!encabezadoFirma) return false;
  const partes = Object.fromEntries(
    encabezadoFirma.split(",").map((p) => p.split("=") as [string, string]),
  );
  const t = partes.t;
  const v1 = partes.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;

  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const esperado = createHmac("sha256", secreto)
    .update(`${t}.${payload}`)
    .digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
