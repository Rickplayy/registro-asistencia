"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  enviarRecuperacion,
  type RecuperacionResult,
} from "@/lib/auth/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RecuperarForm() {
  const [state, formAction, pending] = useActionState<
    RecuperacionResult,
    FormData
  >(enviarRecuperacion, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar contraseña</CardTitle>
        <CardDescription>
          Te enviaremos un enlace para restablecerla.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state?.ok ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Si el correo está registrado, recibirás un enlace de
                recuperación en unos minutos.
              </AlertDescription>
            </Alert>
            <Button
              variant="outline"
              className="w-full"
              render={<Link href="/login" />}
            >
              Volver al inicio de sesión
            </Button>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            {state?.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="tu@empresa.com"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Enviando…" : "Enviar enlace"}
            </Button>
            <p className="text-center text-sm">
              <Link
                href="/login"
                className="text-primary underline-offset-4 hover:underline"
              >
                Volver al inicio de sesión
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
