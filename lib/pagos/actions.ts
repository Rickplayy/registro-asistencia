"use server";

/** Server Actions del flujo de planes y cobro (Fase 5). */
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/db/server";
import { requerirAdmin } from "@/lib/auth/session";
import { auditar } from "@/lib/db/auditoria";
import { PLANES, esPlanValido } from "@/lib/planes";
import type { ProveedorPagos } from "./tipos";
import { proveedorSimulado, abrirTokenCheckout } from "./simulado";
import { proveedorStripe } from "./stripe";
import { activarSuscripcion } from "./suscripciones";

function proveedorActivo(): ProveedorPagos {
  return process.env.STRIPE_SECRET_KEY ? proveedorStripe : proveedorSimulado;
}

async function urlBase(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

/** Inicia el checkout del plan elegido y redirige al proveedor. */
export async function iniciarCambioPlan(formData: FormData): Promise<void> {
  const { perfil, email } = await requerirAdmin();
  if (!perfil.empresa_id) redirect("/plan?error=sin-empresa");
  if (perfil.rol !== "admin_empresa" && perfil.rol !== "super_admin") {
    redirect("/plan?error=solo-admin");
  }

  const planId = String(formData.get("plan") ?? "");
  if (!esPlanValido(planId)) redirect("/plan?error=plan-invalido");
  const plan = PLANES[planId];

  const supabase = await createClient();
  const { data: empresa } = await supabase
    .from("empresas")
    .select("nombre")
    .maybeSingle();

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id!,
    accion: "suscripcion.cambio_plan",
    entidad: "suscripciones",
    entidadId: perfil.empresa_id!,
    detalles: { plan: plan.id, proveedor: proveedorActivo().id },
  });

  const { url } = await proveedorActivo().crearCheckout({
    empresaId: perfil.empresa_id!,
    empresaNombre: empresa?.nombre ?? "",
    adminEmail: email,
    plan,
    urlBase: await urlBase(),
  });
  redirect(url);
}

/**
 * Confirmación del proveedor SIMULADO: valida el token cifrado contra la
 * sesión (misma empresa) y activa. Con Stripe real esto no se usa — la
 * activación llega por webhook firmado.
 */
export async function confirmarPagoSimulado(formData: FormData): Promise<void> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) redirect("/plan?error=sin-empresa");

  const token = String(formData.get("token") ?? "");
  const datos = abrirTokenCheckout(token);
  if (!datos || datos.empresaId !== perfil.empresa_id) {
    redirect("/plan?error=token-invalido");
  }

  const res = await activarSuscripcion({
    empresaId: perfil.empresa_id!,
    plan: datos!.plan,
    proveedor: "simulado",
    referenciaExterna: `sim_${Date.now()}`,
    usuarioAdminId: perfil.id,
  });
  redirect(res.ok ? "/plan?exito=1" : "/plan?error=activacion");
}
