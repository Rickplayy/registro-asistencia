/**
 * Webhook de Stripe (Fase 5): activa/cancela suscripciones.
 * La firma se verifica SIEMPRE con STRIPE_WEBHOOK_SECRET — un webhook sin
 * firma válida se descarta. Nunca llegan datos de tarjeta por aquí.
 */
import { NextResponse, type NextRequest } from "next/server";

import { verificarFirmaStripe } from "@/lib/pagos/stripe";
import {
  activarSuscripcion,
  cancelarSuscripcion,
} from "@/lib/pagos/suscripciones";

type EventoStripe = {
  type: string;
  data: {
    object: {
      id?: string;
      subscription?: string;
      metadata?: { empresa_id?: string; plan?: string };
    };
  };
};

export async function POST(req: NextRequest) {
  const secreto = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secreto) {
    return NextResponse.json(
      { error: "Webhook no configurado (STRIPE_WEBHOOK_SECRET)." },
      { status: 501 },
    );
  }

  const payload = await req.text();
  const firmaValida = await verificarFirmaStripe(
    payload,
    req.headers.get("stripe-signature"),
    secreto,
  );
  if (!firmaValida) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  const evento = JSON.parse(payload) as EventoStripe;
  const objeto = evento.data?.object ?? {};
  const empresaId = objeto.metadata?.empresa_id;

  if (evento.type === "checkout.session.completed" && empresaId) {
    const res = await activarSuscripcion({
      empresaId,
      plan: objeto.metadata?.plan ?? "",
      proveedor: "stripe",
      referenciaExterna: objeto.subscription ?? objeto.id ?? null,
    });
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 500 });
    }
  }

  if (evento.type === "customer.subscription.deleted" && empresaId) {
    await cancelarSuscripcion(empresaId, "cancelada en Stripe");
  }

  return NextResponse.json({ recibido: true });
}
