"use client";

/**
 * Enrolamiento facial con consentimiento bloqueante (sección 8.4, paso 3).
 *
 * La cámara NO se enciende hasta que el operador confirma el consentimiento
 * expreso y por escrito del empleado para datos biométricos (LFPDPPP). El
 * servidor vuelve a verificar el consentimiento antes de guardar: esta UI es
 * la primera barrera, no la única.
 */
import { useState, useTransition } from "react";

import { enrolarRostro } from "@/lib/biometria/enrolamiento";
import { CAPTURAS_ENROLAMIENTO } from "@/lib/biometria/plantilla";
import { CapturaRostro } from "@/components/biometria/captura-rostro";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Fase = "consentimiento" | "captura" | "guardando" | "listo";

export function EnrolamientoFacial({
  empleadoId,
  onEnrolado,
}: {
  empleadoId: string;
  /** Notifica al contenedor para refrescar el estado biométrico mostrado. */
  onEnrolado?: () => void;
}) {
  const [fase, setFase] = useState<Fase>("consentimiento");
  const [consentimiento, setConsentimiento] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function guardar(capturas: number[][]) {
    setFase("guardando");
    setError(null);
    startTransition(async () => {
      const res = await enrolarRostro(empleadoId, capturas, consentimiento);
      if (res.ok) {
        setFase("listo");
        onEnrolado?.();
      } else {
        setError(res.error);
        setFase("consentimiento");
      }
    });
  }

  if (fase === "listo") {
    return (
      <Alert>
        <AlertDescription>
          Rostro enrolado. El empleado ya puede fichar con reconocimiento facial
          en el kiosko.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {fase === "consentimiento" && (
        <>
          <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
            <Checkbox
              checked={consentimiento}
              onCheckedChange={(v) => setConsentimiento(v === true)}
            />
            <span>
              El empleado otorgó su{" "}
              <strong>consentimiento expreso y por escrito</strong> para el
              tratamiento de sus <strong>datos biométricos faciales</strong>{" "}
              conforme al aviso de privacidad{" "}
              <strong>v1.0-biometrico-2026-07</strong> (LFPDPPP, datos
              sensibles). Quedará registrado con fecha e IP como evidencia. *
            </span>
          </label>
          <Button
            type="button"
            disabled={!consentimiento}
            onClick={() => setFase("captura")}
          >
            Iniciar captura de rostro
          </Button>
          {!consentimiento && (
            <p className="text-xs text-muted-foreground">
              Sin consentimiento no es posible activar la cámara ni enrolar
              (requisito legal, no configurable).
            </p>
          )}
        </>
      )}

      {(fase === "captura" || fase === "guardando") && (
        <>
          <CapturaRostro
            capturasObjetivo={CAPTURAS_ENROLAMIENTO}
            onCapturas={guardar}
          />
          {fase === "guardando" && (
            <p className="text-center text-sm">Guardando plantilla cifrada…</p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => setFase("consentimiento")}
            disabled={fase === "guardando"}
          >
            Cancelar
          </Button>
        </>
      )}
    </div>
  );
}
