"use client";

/**
 * Panel de huella del kiosko (WebAuthn).
 *
 * - Fichar: pide la aserción al sensor del aparato (Windows Hello / Touch ID /
 *   Android). La credencial descubrible identifica al empleado sin teclear.
 * - Enrolar (primera vez): el empleado se identifica con su PIN; el servidor
 *   exige consentimiento biometrico_huella vigente antes de crear el passkey.
 *
 * El dato biométrico NUNCA sale del aparato: aquí solo viajan opciones,
 * una clave pública (enrolamiento) y una firma (check-in).
 */
import { useState } from "react";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

import { cn } from "@/lib/utils";

type Modo = "menu" | "fichar" | "enrolar-pin" | "enrolar-sensor" | "hecho";

export function HuellaKiosko({
  onAsercion,
  onCancelar,
}: {
  /** Recibe la aserción WebAuthn serializada para enviarla al check-in. */
  onAsercion: (asercionJson: string) => Promise<void> | void;
  onCancelar: () => void;
}) {
  const [modo, setModo] = useState<Modo>("menu");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function fichar() {
    setError(null);
    setOcupado(true);
    setModo("fichar");
    try {
      const res = await fetch("/api/kiosko/huella/opciones", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo iniciar.");
      const asercion = await startAuthentication({
        optionsJSON: data.opciones,
      });
      await onAsercion(JSON.stringify(asercion));
      setModo("menu");
    } catch (e) {
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Lectura cancelada o sin huella enrolada en este aparato."
          : e instanceof Error
            ? e.message
            : "No se pudo leer la huella.",
      );
      setModo("menu");
    } finally {
      setOcupado(false);
    }
  }

  async function enrolar() {
    setError(null);
    setOcupado(true);
    try {
      const resOpc = await fetch("/api/kiosko/huella/registro/opciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const dataOpc = await resOpc.json();
      if (!resOpc.ok) throw new Error(dataOpc.error ?? "PIN no reconocido.");

      setModo("enrolar-sensor");
      const credencial = await startRegistration({
        optionsJSON: dataOpc.opciones,
      });

      const resReg = await fetch("/api/kiosko/huella/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credencial }),
      });
      const dataReg = await resReg.json();
      if (!resReg.ok) throw new Error(dataReg.error ?? "No se pudo enrolar.");

      setModo("hecho");
    } catch (e) {
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Registro cancelado en el sensor."
          : e instanceof Error
            ? e.message
            : "No se pudo enrolar la huella.",
      );
      setModo("enrolar-pin");
    } finally {
      setOcupado(false);
      setPin("");
    }
  }

  return (
    <div className="w-full max-w-md space-y-4 text-center">
      {error && (
        <p className="rounded-xl bg-destructive px-4 py-3 text-sm text-white">
          {error}
        </p>
      )}

      {modo === "menu" && (
        <>
          <p className="text-lg">Huella digital (sensor de este aparato)</p>
          <div className="grid gap-3">
            <button
              type="button"
              disabled={ocupado}
              onClick={fichar}
              className="rounded-xl border-2 border-white/30 bg-white/10 px-4 py-4 text-lg font-semibold transition-all hover:bg-white/20 active:scale-95"
            >
              👍 Fichar con mi huella
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => {
                setError(null);
                setModo("enrolar-pin");
              }}
              className="rounded-xl border-2 border-white/20 bg-white/5 px-4 py-3 text-sm transition-all hover:bg-white/15"
            >
              Primera vez aquí · Enrolar mi huella
            </button>
          </div>
        </>
      )}

      {modo === "fichar" && (
        <p className="text-lg">Pon tu dedo en el sensor…</p>
      )}

      {modo === "enrolar-pin" && (
        <div className="space-y-3">
          <p className="text-sm opacity-80">
            Teclea tu PIN para identificarte. Requiere que RH ya haya registrado
            tu consentimiento de huella.
          </p>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            maxLength={8}
            placeholder="PIN"
            className="w-full rounded-xl border-2 border-white/30 bg-white/10 px-4 py-4 text-center font-mono text-2xl tracking-[0.4em] outline-none placeholder:tracking-normal placeholder:text-white/40 focus:border-white"
            autoFocus
          />
          <button
            type="button"
            disabled={pin.length < 4 || ocupado}
            onClick={enrolar}
            className={cn(
              "w-full rounded-xl bg-success px-4 py-3 text-lg font-semibold text-success-foreground transition-all active:scale-95",
              (pin.length < 4 || ocupado) && "opacity-50",
            )}
          >
            {ocupado ? "Verificando…" : "Continuar"}
          </button>
        </div>
      )}

      {modo === "enrolar-sensor" && (
        <p className="text-lg">
          Sigue las instrucciones del aparato para registrar tu huella…
        </p>
      )}

      {modo === "hecho" && (
        <div className="space-y-3">
          <p className="rounded-xl bg-success px-4 py-4 text-lg font-semibold text-success-foreground">
            Huella enrolada. Ya puedes fichar con ella en este aparato.
          </p>
          <button
            type="button"
            onClick={() => setModo("menu")}
            className="rounded-xl border-2 border-white/30 bg-white/10 px-4 py-3 text-sm hover:bg-white/20"
          >
            Fichar ahora
          </button>
        </div>
      )}

      <p className="text-xs opacity-60">
        Tu huella se queda en este aparato: el sistema solo guarda una clave de
        verificación, nunca la huella.
      </p>
      <button
        type="button"
        className="w-full text-center text-sm opacity-70 hover:opacity-100"
        onClick={onCancelar}
      >
        ← Regresar
      </button>
    </div>
  );
}
