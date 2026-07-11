"use client";

import { useActionState } from "react";

import {
  actualizarEmpresa,
  type ConfigEmpresaResult,
} from "@/lib/empleados/empresa";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

type EmpresaConfig = {
  nombre: string;
  rfc_empresa: string | null;
  hora_entrada: string;
  hora_salida: string;
  tolerancia_retardo_minutos: number;
  metodos: string[];
};

export function ConfiguracionForm({
  empresa,
  puedeEditar,
}: {
  empresa: EmpresaConfig;
  puedeEditar: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    ConfigEmpresaResult,
    FormData
  >(actualizarEmpresa, undefined);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state?.ok && (
        <Alert>
          <AlertDescription>Configuración guardada.</AlertDescription>
        </Alert>
      )}
      {!puedeEditar && (
        <Alert>
          <AlertDescription>
            Solo lectura: únicamente el administrador de la empresa puede editar
            la configuración.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Empresa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              name="nombre"
              defaultValue={empresa.nombre}
              disabled={!puedeEditar}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rfc_empresa">RFC</Label>
            <Input
              id="rfc_empresa"
              name="rfc_empresa"
              defaultValue={empresa.rfc_empresa ?? ""}
              className="uppercase"
              maxLength={13}
              disabled={!puedeEditar}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Jornada de referencia</CardTitle>
          <CardDescription>
            Con esto se calculan retardos y faltas en dashboard y reportes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="hora_entrada">Hora de entrada</Label>
            <Input
              id="hora_entrada"
              name="hora_entrada"
              type="time"
              defaultValue={empresa.hora_entrada}
              disabled={!puedeEditar}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hora_salida">Hora de salida</Label>
            <Input
              id="hora_salida"
              name="hora_salida"
              type="time"
              defaultValue={empresa.hora_salida}
              disabled={!puedeEditar}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tolerancia">Tolerancia (min)</Label>
            <Input
              id="tolerancia"
              name="tolerancia"
              type="number"
              min={0}
              max={120}
              defaultValue={empresa.tolerancia_retardo_minutos}
              disabled={!puedeEditar}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Métodos de registro habilitados</CardTitle>
          <CardDescription>
            La huella digital se habilitará en la Fase 3.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              name="metodo_pin"
              defaultChecked={empresa.metodos.includes("pin")}
              disabled={!puedeEditar}
            />
            PIN numérico
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              name="metodo_qr"
              defaultChecked={empresa.metodos.includes("qr")}
              disabled={!puedeEditar}
            />
            Código QR rotativo
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              name="metodo_facial"
              defaultChecked={empresa.metodos.includes("facial")}
              disabled={!puedeEditar}
            />
            <span>
              Biometría facial{" "}
              <span className="text-muted-foreground">
                (requiere consentimiento biométrico por empleado)
              </span>
            </span>
          </label>
          <label className="flex items-center gap-3 text-sm opacity-50">
            <Checkbox disabled /> Huella digital (Fase 3)
          </label>
        </CardContent>
      </Card>

      {puedeEditar && (
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar configuración"}
        </Button>
      )}
    </form>
  );
}
