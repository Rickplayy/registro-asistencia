"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  registrarEmpresa,
  type RegistroEmpresaResult,
} from "@/lib/auth/onboarding";
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

export function RegistroForm() {
  const [state, formAction, pending] = useActionState<
    RegistroEmpresaResult,
    FormData
  >(registrarEmpresa, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos de la empresa y del administrador</CardTitle>
        <CardDescription>
          Podrás invitar a más usuarios de RH después.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="empresa_nombre">Nombre de la empresa *</Label>
            <Input
              id="empresa_nombre"
              name="empresa_nombre"
              placeholder="Comercializadora Ejemplo SA de CV"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="empresa_rfc">RFC de la empresa</Label>
            <Input
              id="empresa_rfc"
              name="empresa_rfc"
              placeholder="ABC010101XYZ"
              className="uppercase"
              maxLength={13}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin_nombre">Tu nombre *</Label>
            <Input id="admin_nombre" name="admin_nombre" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico *</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña * (mínimo 8 caracteres)</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creando empresa…" : "Crear empresa"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link
              href="/login"
              className="text-primary underline-offset-4 hover:underline"
            >
              Inicia sesión
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
