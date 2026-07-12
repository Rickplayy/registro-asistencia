"use client";

/**
 * White-label (Fase 5): logo y color de marca. El archivo se convierte a
 * data-URL en el navegador; el servidor valida tipo y tamaño (guardarMarca).
 */
import { useActionState, useState } from "react";

import {
  guardarMarca,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_ARCHIVO_BYTES = 150_000;

export function MarcaForm({
  colorActual,
  logoActual,
  permitido,
}: {
  colorActual: string | null;
  logoActual: string | null;
  permitido: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    ConfigEmpresaResult,
    FormData
  >(guardarMarca, undefined);
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);

  function leerArchivo(archivo: File | undefined) {
    setErrorArchivo(null);
    setLogoDataUrl("");
    if (!archivo) return;
    if (archivo.size > MAX_ARCHIVO_BYTES) {
      setErrorArchivo("El logo debe pesar máximo 150 KB.");
      return;
    }
    const lector = new FileReader();
    lector.onload = () => setLogoDataUrl(String(lector.result ?? ""));
    lector.readAsDataURL(archivo);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Marca propia (white-label)</CardTitle>
        <CardDescription>
          Logo y color de tu empresa en el kiosko de fichaje. Los colores de
          estado (verde/ámbar/rojo) se conservan por accesibilidad.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!permitido ? (
          <Alert>
            <AlertDescription>
              Disponible en los planes Pro y Enterprise — cámbialo en Plan y
              facturación.
            </AlertDescription>
          </Alert>
        ) : (
          <form action={formAction} className="space-y-4">
            {state?.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            {state?.ok && (
              <Alert>
                <AlertDescription>Marca guardada.</AlertDescription>
              </Alert>
            )}
            {errorArchivo && (
              <Alert variant="destructive">
                <AlertDescription>{errorArchivo}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label htmlFor="color_marca">Color de marca</Label>
                <Input
                  id="color_marca"
                  name="color_marca"
                  type="color"
                  defaultValue={colorActual ?? "#1E3A5F"}
                  className="h-10 w-20 p-1"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="logo_archivo">
                  Logo (PNG/JPEG/SVG, ≤150 KB)
                </Label>
                <Input
                  id="logo_archivo"
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={(e) => leerArchivo(e.target.files?.[0])}
                />
                <input type="hidden" name="logo_data_url" value={logoDataUrl} />
              </div>
              {(logoDataUrl || logoActual) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoDataUrl || logoActual || ""}
                  alt="Vista previa del logo"
                  className="h-12 w-auto rounded border bg-white p-1"
                />
              )}
            </div>

            {logoActual && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="quitar_logo" /> Quitar el logo
                actual
              </label>
            )}

            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar marca"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
