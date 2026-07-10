"use client";

import Link from "next/link";
import { useActionState } from "react";

import { iniciarSesion, type AuthResult } from "@/lib/auth/actions";
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

export function LoginForm({ mensajeInicial }: { mensajeInicial?: string }) {
  const [state, formAction, pending] = useActionState<AuthResult, FormData>(
    iniciarSesion,
    mensajeInicial ? { error: mensajeInicial } : undefined,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
        <CardDescription>
          Acceso exclusivo para administradores, RH y supervisores.
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
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Verificando…" : "Entrar"}
          </Button>
          <p className="text-center text-sm">
            <Link
              href="/login/recuperar"
              className="text-primary underline-offset-4 hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
