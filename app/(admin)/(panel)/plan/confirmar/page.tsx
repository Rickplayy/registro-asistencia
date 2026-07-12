import type { Metadata } from "next";

import { requerirAdmin } from "@/lib/auth/session";
import { abrirTokenCheckout } from "@/lib/pagos/simulado";
import { confirmarPagoSimulado } from "@/lib/pagos/actions";
import { PLANES, type PlanId } from "@/lib/planes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Confirmar pago · Registro de Asistencia",
};

/**
 * "Checkout" del proveedor SIMULADO (desarrollo/demo). Con Stripe configurado
 * este paso lo sustituye la página hospedada de Stripe y el webhook firmado.
 */
export default async function ConfirmarPagoPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { perfil } = await requerirAdmin();
  const { token } = await searchParams;
  const datos = token ? abrirTokenCheckout(token) : null;
  const valido = Boolean(
    datos && perfil.empresa_id && datos.empresaId === perfil.empresa_id,
  );
  const plan = valido ? PLANES[datos!.plan as PlanId] : null;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Checkout simulado</CardTitle>
          <CardDescription>
            Entorno sin proveedor de pagos real: este paso simula la página de
            cobro del proveedor certificado. Ningún dato de tarjeta se captura.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!valido || !plan ? (
            <Alert variant="destructive">
              <AlertDescription>
                La sesión de pago expiró o no corresponde a tu empresa. Regresa
                a Plan y facturación e inténtalo de nuevo.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <p className="text-sm">
                Suscripción mensual al plan <strong>{plan.nombre}</strong> — $
                {plan.precioMensualMxn.toLocaleString("es-MX")} MXN/mes.
              </p>
              <form action={confirmarPagoSimulado}>
                <input type="hidden" name="token" value={token} />
                <Button type="submit" className="w-full">
                  Confirmar pago (simulado)
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
