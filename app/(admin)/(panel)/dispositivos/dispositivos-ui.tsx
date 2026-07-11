"use client";

import { useActionState, useState, useTransition } from "react";

import {
  crearDispositivo,
  desactivarDispositivo,
  type AltaDispositivoResult,
} from "@/lib/empleados/dispositivos";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AltaDispositivo() {
  const [state, formAction, pending] = useActionState<
    AltaDispositivoResult,
    FormData
  >(crearDispositivo, undefined);

  return (
    <Dialog>
      <DialogTrigger render={<Button />}>+ Nuevo dispositivo</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo dispositivo</DialogTitle>
          <DialogDescription>
            Kiosko web o lector físico (agente local). Al crearlo obtendrás su
            clave de vinculación — se muestra una sola vez.
          </DialogDescription>
        </DialogHeader>

        {state?.ok ? (
          <div className="space-y-3">
            <Alert>
              <AlertTitle>Clave de “{state.nombre}”</AlertTitle>
              <AlertDescription className="break-all font-mono text-xs">
                {state.clave}
              </AlertDescription>
            </Alert>
            <p className="text-sm text-muted-foreground">
              Cópiala ahora y pégala en la pantalla de vinculación del kiosko (
              <span className="font-mono">/kiosko</span> en el dispositivo). En
              la base solo se guarda su hash: si la pierdes, desactiva el
              dispositivo y crea otro.
            </p>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            {state && !state.ok && state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="disp_tipo">Tipo</Label>
              <select
                id="disp_tipo"
                name="tipo"
                defaultValue="kiosko"
                className="border-input bg-background flex h-8 w-full rounded-lg border px-2.5 text-sm"
              >
                <option value="kiosko">
                  Kiosko web (tablet/PC con navegador)
                </option>
                <option value="lector_fisico">
                  Lector físico (ZKTeco/Suprema vía agente local)
                </option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="disp_nombre">Nombre *</Label>
              <Input
                id="disp_nombre"
                name="nombre"
                placeholder="Kiosko recepción"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="disp_ubicacion">Ubicación</Label>
              <Input
                id="disp_ubicacion"
                name="ubicacion"
                placeholder="Planta baja, entrada principal"
              />
            </div>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Creando…" : "Crear y obtener clave"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function BotonDesactivar({ dispositivoId }: { dispositivoId: string }) {
  const [enTransicion, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button
        variant="destructive"
        size="sm"
        disabled={enTransicion}
        onClick={() =>
          startTransition(async () => {
            const res = await desactivarDispositivo(dispositivoId);
            if (res.error) setError(res.error);
          })
        }
      >
        Desactivar
      </Button>
    </div>
  );
}
