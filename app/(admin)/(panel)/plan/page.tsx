import type { Metadata } from "next";

import { requerirAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { PLANES, obtenerPlan } from "@/lib/planes";
import { iniciarCambioPlan } from "@/lib/pagos/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Plan y facturación · Registro de Asistencia",
};

const MENSAJES: Record<string, { texto: string; error?: boolean }> = {
  exito: { texto: "Suscripción activada. Tu plan ya está vigente." },
  cancelado: { texto: "Pago cancelado; tu plan no cambió.", error: true },
  "token-invalido": {
    texto: "La sesión de pago expiró o no es válida. Intenta de nuevo.",
    error: true,
  },
  "solo-admin": {
    texto: "Solo el administrador de la empresa puede cambiar el plan.",
    error: true,
  },
  activacion: { texto: "No se pudo activar la suscripción.", error: true },
};

/** Fase 5 — Planes de suscripción y cobro recurrente. */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ exito?: string; cancelado?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { perfil } = await requerirAdmin();
  const supabase = await createClient();

  const [{ data: empresa }, { data: suscripcion }, { count: activos }] =
    await Promise.all([
      supabase.from("empresas").select("plan").maybeSingle(),
      supabase
        .from("suscripciones")
        .select("plan, estado, proveedor, periodo_fin")
        .maybeSingle(),
      supabase
        .from("empleados")
        .select("id", { count: "exact", head: true })
        .eq("estatus", "activo"),
    ]);

  const planActual = obtenerPlan(empresa?.plan);
  const mensaje = sp.exito
    ? MENSAJES.exito
    : sp.cancelado
      ? MENSAJES.cancelado
      : sp.error
        ? (MENSAJES[sp.error] ?? MENSAJES.activacion)
        : null;
  const puedeCambiar =
    perfil.rol === "admin_empresa" || perfil.rol === "super_admin";
  const conStripe = Boolean(process.env.STRIPE_SECRET_KEY);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand">
          Plan y facturación
        </h1>
        <p className="text-sm text-muted-foreground">
          Cobro recurrente mensual mediante proveedor certificado — los datos de
          tarjeta nunca tocan este sistema.
        </p>
      </div>

      {mensaje && (
        <Alert variant={mensaje.error ? "destructive" : undefined}>
          <AlertDescription>{mensaje.texto}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Plan actual: {planActual.nombre}{" "}
            {suscripcion?.estado === "activa" ? (
              <Badge className="bg-success text-success-foreground">
                suscripción activa
              </Badge>
            ) : (
              <Badge variant="secondary">
                {suscripcion?.estado ?? "sin suscripción"}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {activos ?? 0} empleados activos
            {planActual.maxEmpleados !== null &&
              ` de ${planActual.maxEmpleados} permitidos`}
            {suscripcion?.periodo_fin &&
              ` · Próxima renovación: ${new Date(suscripcion.periodo_fin).toLocaleDateString("es-MX")}`}
            {!conStripe &&
              " · Proveedor de pagos en modo SIMULADO (configura STRIPE_SECRET_KEY para cobro real)"}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {Object.values(PLANES).map((plan) => (
          <Card
            key={plan.id}
            className={plan.id === planActual.id ? "border-primary" : undefined}
          >
            <CardHeader>
              <CardTitle>{plan.nombre}</CardTitle>
              <CardDescription>
                ${plan.precioMensualMxn.toLocaleString("es-MX")} MXN / mes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1 text-sm">
                <li>
                  {plan.maxEmpleados === null
                    ? "Empleados ilimitados"
                    : `Hasta ${plan.maxEmpleados} empleados`}
                </li>
                <li>Métodos: {plan.metodosPermitidos.join(", ")}</li>
                <li>
                  {plan.whiteLabel ? "✓" : "✗"} Marca propia (white-label)
                </li>
                <li>{plan.nomina ? "✓" : "✗"} Proyección de nómina</li>
                <li>{plan.lectoresFisicos ? "✓" : "✗"} Lectores físicos</li>
              </ul>
              {plan.id === planActual.id ? (
                <Button disabled className="w-full" variant="outline">
                  Plan actual
                </Button>
              ) : (
                <form action={iniciarCambioPlan}>
                  <input type="hidden" name="plan" value={plan.id} />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!puedeCambiar}
                  >
                    Cambiar a {plan.nombre}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
