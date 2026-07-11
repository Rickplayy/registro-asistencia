"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  crearEmpleado,
  type AltaEmpleadoResult,
} from "@/lib/empleados/actions";
import { EnrolamientoFacial } from "@/components/biometria/enrolamiento-facial";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AltaEmpleadoWizard() {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [consentimiento, setConsentimiento] = useState(false);
  const [state, formAction, pending] = useActionState<
    AltaEmpleadoResult,
    FormData
  >(crearEmpleado, undefined);

  if (state && "ok" in state && state.ok) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-success">
              Empleado dado de alta
            </CardTitle>
            <CardDescription>
              Su consentimiento quedó registrado y sus métodos de acceso están
              listos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTitle>PIN de acceso: {state.pin}</AlertTitle>
              <AlertDescription>
                Compártelo con el empleado por un medio seguro. Por seguridad no
                se vuelve a mostrar: si se pierde, regenera uno nuevo desde su
                ficha.
              </AlertDescription>
            </Alert>
            <div className="flex gap-3">
              <Button render={<Link href={`/empleados/${state.empleadoId}`} />}>
                Ver ficha y QR
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.assign("/empleados/nuevo")}
              >
                Dar de alta otro
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paso 3 de 3 · Enrolamiento facial (opcional)</CardTitle>
            <CardDescription>
              Requiere consentimiento expreso específico para datos biométricos
              (LFPDPPP). Solo se guarda la plantilla matemática cifrada; nunca
              una fotografía. También puede hacerse después desde su ficha.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EnrolamientoFacial empleadoId={state.empleadoId} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>
            {paso === 1
              ? "Paso 1 de 3 · Datos personales"
              : "Paso 2 de 3 · Puesto y empresa"}
          </CardTitle>
          <CardDescription>
            {paso === 1
              ? "CURP, RFC y fecha de nacimiento se guardan cifrados."
              : "Datos laborales del empleado."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state && "error" in state && state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {/* Paso 1 — siempre montado (hidden) para que el form conserve valores */}
          <div className={paso === 1 ? "space-y-4" : "hidden"}>
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre completo *</Label>
              <Input id="nombre" name="nombre" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="curp">CURP</Label>
                <Input
                  id="curp"
                  name="curp"
                  maxLength={18}
                  className="uppercase"
                  placeholder="GOMC900101HDFRRL09"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rfc">RFC</Label>
                <Input
                  id="rfc"
                  name="rfc"
                  maxLength={13}
                  className="uppercase"
                  placeholder="GOMC900101AB1"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fecha_nacimiento">Fecha de nacimiento</Label>
                <Input
                  id="fecha_nacimiento"
                  name="fecha_nacimiento"
                  type="date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sexo">Sexo</Label>
                <select
                  id="sexo"
                  name="sexo"
                  className="border-input bg-background flex h-8 w-full rounded-lg border px-2.5 text-sm"
                  defaultValue=""
                >
                  <option value="">Sin especificar</option>
                  <option value="M">Mujer</option>
                  <option value="H">Hombre</option>
                </select>
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
              <Checkbox
                name="consentimiento"
                checked={consentimiento}
                onCheckedChange={(v) => setConsentimiento(v === true)}
              />
              <span>
                El empleado otorgó su <strong>consentimiento expreso</strong>{" "}
                para el tratamiento de sus datos personales conforme al aviso de
                privacidad <strong>v1.0-2026-07</strong> (LFPDPPP). Quedará
                registrado con fecha e IP como evidencia. *
              </span>
            </label>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => setPaso(2)}
                disabled={!consentimiento}
              >
                Siguiente →
              </Button>
            </div>
          </div>

          {/* Paso 2 */}
          <div className={paso === 2 ? "space-y-4" : "hidden"}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="puesto">Puesto</Label>
                <Input id="puesto" name="puesto" placeholder="Ventas" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="numero_empleado">Número de empleado</Label>
                <Input id="numero_empleado" name="numero_empleado" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fecha_ingreso">Fecha de ingreso</Label>
              <Input id="fecha_ingreso" name="fecha_ingreso" type="date" />
            </div>
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Al guardar se generan automáticamente su PIN y su código QR
              rotativo, y podrás enrolar su rostro en el paso 3 (opcional, con
              consentimiento biométrico específico).
            </div>
            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPaso(1)}
              >
                ← Regresar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Guardar empleado"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
