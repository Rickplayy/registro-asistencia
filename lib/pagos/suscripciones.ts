/**
 * Activación/cancelación de suscripciones — SOLO backend (service_role).
 * Los clientes no tienen políticas de escritura sobre `suscripciones`.
 */
import { createAdminClient } from "@/lib/db/admin";
import { esPlanValido } from "@/lib/planes";

export async function activarSuscripcion(args: {
  empresaId: string;
  plan: string;
  proveedor: "simulado" | "stripe";
  referenciaExterna?: string | null;
  /** id del admin que inició el cambio (null si llegó por webhook). */
  usuarioAdminId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!esPlanValido(args.plan)) return { ok: false, error: "Plan inválido." };

  const admin = createAdminClient();
  const periodoFin = new Date();
  periodoFin.setMonth(periodoFin.getMonth() + 1);

  const { error: errSus } = await admin.from("suscripciones").upsert(
    {
      empresa_id: args.empresaId,
      plan: args.plan,
      estado: "activa",
      proveedor: args.proveedor,
      referencia_externa: args.referenciaExterna ?? null,
      periodo_fin: periodoFin.toISOString(),
    },
    { onConflict: "empresa_id" },
  );
  if (errSus) return { ok: false, error: "No se pudo guardar la suscripción." };

  const { error: errPlan } = await admin
    .from("empresas")
    .update({ plan: args.plan })
    .eq("id", args.empresaId);
  if (errPlan) return { ok: false, error: "No se pudo actualizar el plan." };

  await admin.from("auditoria").insert({
    usuario_admin_id: args.usuarioAdminId ?? null,
    empresa_id: args.empresaId,
    accion: "suscripcion.activacion",
    entidad_afectada: "suscripciones",
    entidad_id: args.empresaId,
    detalles: {
      plan: args.plan,
      proveedor: args.proveedor,
      referencia: args.referenciaExterna ?? null,
    },
  });

  return { ok: true };
}

export async function cancelarSuscripcion(
  empresaId: string,
  motivo: string,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("suscripciones")
    .update({ estado: "cancelada" })
    .eq("empresa_id", empresaId);
  await admin.from("auditoria").insert({
    usuario_admin_id: null,
    empresa_id: empresaId,
    accion: "suscripcion.cancelacion",
    entidad_afectada: "suscripciones",
    entidad_id: empresaId,
    detalles: { motivo },
  });
}
