"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CapturaRostro } from "@/components/biometria/captura-rostro";
import { HuellaKiosko } from "@/components/biometria/huella-kiosko";

type Metodo = "pin" | "qr" | "facial" | "huella";

type Confirmacion = {
  ok: boolean;
  mensaje: string;
  detalle?: string;
};

const METODOS: {
  id: Metodo;
  etiqueta: string;
  icono: string;
  faseFutura?: string;
}[] = [
  { id: "pin", etiqueta: "PIN", icono: "🔢" },
  { id: "qr", etiqueta: "Código QR", icono: "▦" },
  { id: "facial", etiqueta: "Rostro", icono: "🙂" },
  { id: "huella", etiqueta: "Huella", icono: "👍" },
];

function Reloj() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-center">
      <p className="font-mono text-6xl font-bold tabular-nums">
        {ahora.toLocaleTimeString("es-MX", { hour12: false })}
      </p>
      <p className="mt-1 text-lg capitalize opacity-80">
        {ahora.toLocaleDateString("es-MX", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
    </div>
  );
}

export function KioskoCheckin({
  empresaNombre,
  dispositivoNombre,
  metodosHabilitados,
  logoDataUrl = null,
  colorMarca = null,
}: {
  empresaNombre: string;
  dispositivoNombre: string;
  metodosHabilitados: string[];
  /** White-label (Fase 5): logo/color de la empresa si su plan lo incluye. */
  logoDataUrl?: string | null;
  colorMarca?: string | null;
}) {
  const [metodoActivo, setMetodoActivo] = useState<Metodo | null>(null);
  const [pin, setPin] = useState("");
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [enviando, setEnviando] = useState(false);
  const qrInputRef = useRef<HTMLInputElement>(null);

  const enviar = useCallback(
    async (metodo: Metodo, valor: string) => {
      if (enviando) return;
      setEnviando(true);
      try {
        const res = await fetch("/api/kiosko/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metodo, valor }),
        });
        const data = await res.json();
        if (res.ok) {
          setConfirmacion({
            ok: true,
            mensaje: `${data.tipo === "entrada" ? "Entrada" : "Salida"} registrada · ${data.hora}`,
            detalle: data.empleadoNombre,
          });
          setMetodoActivo(null);
        } else {
          setConfirmacion({
            ok: false,
            mensaje: data.error ?? "No se pudo registrar.",
          });
        }
      } catch {
        setConfirmacion({
          ok: false,
          mensaje: "Sin conexión con el servidor.",
        });
      } finally {
        setPin("");
        setEnviando(false);
      }
    },
    [enviando],
  );

  // La confirmación se borra sola para el siguiente empleado en la fila.
  useEffect(() => {
    if (!confirmacion) return;
    const t = setTimeout(() => setConfirmacion(null), 6000);
    return () => clearTimeout(t);
  }, [confirmacion]);

  // El campo QR mantiene el foco: los lectores USB escriben como teclado.
  useEffect(() => {
    if (metodoActivo === "qr") qrInputRef.current?.focus();
  }, [metodoActivo, confirmacion]);

  function teclaPin(d: string) {
    if (d === "⌫") {
      setPin((p) => p.slice(0, -1));
    } else if (pin.length < 8) {
      setPin((p) => p + d);
    }
  }

  return (
    <main
      className="flex min-h-screen flex-col bg-brand px-4 py-6 text-brand-foreground"
      // White-label: el color de marca sustituye el fondo base; los colores de
      // estado (verde/ámbar/rojo) se mantienen fijos (sección 7.3).
      style={colorMarca ? { backgroundColor: colorMarca } : undefined}
    >
      <header className="flex items-center justify-between text-sm opacity-90">
        <span className="flex items-center gap-2">
          {logoDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoDataUrl}
              alt=""
              className="h-8 w-auto rounded bg-white/90 p-0.5"
            />
          )}
          {empresaNombre}
        </span>
        <span>{dispositivoNombre}</span>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <Reloj />

        {/* Confirmación inmediata (verde = éxito, rojo = error) */}
        <div
          aria-live="polite"
          className={cn(
            "min-h-20 w-full max-w-xl rounded-xl px-6 py-4 text-center transition-all",
            confirmacion
              ? confirmacion.ok
                ? "bg-success text-success-foreground"
                : "bg-destructive text-white"
              : "bg-white/5",
          )}
        >
          {confirmacion ? (
            <>
              <p className="text-2xl font-semibold">{confirmacion.mensaje}</p>
              {confirmacion.detalle && (
                <p className="text-lg opacity-90">{confirmacion.detalle}</p>
              )}
            </>
          ) : (
            <p className="pt-3 text-lg opacity-70">
              Elige tu método para registrar entrada o salida
            </p>
          )}
        </div>

        {/* Botones grandes en una sola fila (sección 8.2) */}
        {metodoActivo === null && (
          <div className="grid w-full max-w-3xl grid-cols-2 gap-4 md:grid-cols-4">
            {METODOS.map((m) => {
              const habilitado =
                !m.faseFutura && metodosHabilitados.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={!habilitado}
                  onClick={() => setMetodoActivo(m.id)}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border-2 text-xl font-semibold transition-all",
                    habilitado
                      ? "border-white/30 bg-white/10 hover:border-white hover:bg-white/20 active:scale-95"
                      : "cursor-not-allowed border-white/10 bg-white/5 opacity-40",
                  )}
                >
                  <span className="text-5xl">{m.icono}</span>
                  {m.etiqueta}
                  {m.faseFutura && (
                    <span className="text-xs font-normal opacity-70">
                      Próximamente · {m.faseFutura}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Teclado PIN */}
        {metodoActivo === "pin" && (
          <div className="w-full max-w-xs space-y-4">
            <p className="text-center font-mono text-4xl tracking-[0.5em] tabular-nums">
              {pin ? "•".repeat(pin.length) : "······"}
            </p>
            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0"].map(
                (d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => teclaPin(d)}
                    className={cn(
                      "h-16 rounded-xl border-2 border-white/30 bg-white/10 text-2xl font-semibold transition-all hover:bg-white/20 active:scale-95",
                      d === "⌫" && "col-start-1",
                      d === "0" && "col-start-2",
                    )}
                  >
                    {d}
                  </button>
                ),
              )}
              <Button
                className="col-start-3 h-16 rounded-xl bg-success text-lg text-success-foreground hover:bg-success/90"
                disabled={pin.length < 4 || enviando}
                onClick={() => enviar("pin", pin)}
              >
                {enviando ? "…" : "OK"}
              </Button>
            </div>
            <button
              type="button"
              className="w-full text-center text-sm opacity-70 hover:opacity-100"
              onClick={() => {
                setPin("");
                setMetodoActivo(null);
              }}
            >
              ← Regresar
            </button>
          </div>
        )}

        {/* Reconocimiento facial: el descriptor se extrae aquí, en el kiosko;
            al servidor solo viajan 128 números, nunca la imagen. */}
        {metodoActivo === "facial" && (
          <div className="w-full max-w-md space-y-4">
            <CapturaRostro
              capturasObjetivo={1}
              onCapturas={async (descriptores) => {
                await enviar("facial", JSON.stringify(descriptores[0]));
                setMetodoActivo(null);
              }}
            />
            <button
              type="button"
              className="w-full text-center text-sm opacity-70 hover:opacity-100"
              onClick={() => setMetodoActivo(null)}
            >
              ← Regresar
            </button>
          </div>
        )}

        {/* Huella (WebAuthn): el sensor del aparato verifica; al servidor solo
            viaja la aserción firmada, jamás la huella. */}
        {metodoActivo === "huella" && (
          <HuellaKiosko
            onAsercion={async (asercionJson) => {
              await enviar("huella", asercionJson);
              setMetodoActivo(null);
            }}
            onCancelar={() => setMetodoActivo(null)}
          />
        )}

        {/* Lector QR (escáner USB teclea el código y termina con Enter) */}
        {metodoActivo === "qr" && (
          <div className="w-full max-w-md space-y-4 text-center">
            <p className="text-lg">Acerca tu código QR al lector</p>
            <input
              ref={qrInputRef}
              className="w-full rounded-xl border-2 border-white/30 bg-white/10 px-4 py-4 text-center font-mono text-sm outline-none placeholder:text-white/40 focus:border-white"
              placeholder="Esperando lectura…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = e.currentTarget.value.trim();
                  e.currentTarget.value = "";
                  if (v) enviar("qr", v);
                }
              }}
              autoFocus
            />
            <p className="text-sm opacity-70">
              El código rota cada 30 segundos; muéstralo desde tu ficha o
              dispositivo.
            </p>
            <button
              type="button"
              className="w-full text-center text-sm opacity-70 hover:opacity-100"
              onClick={() => setMetodoActivo(null)}
            >
              ← Regresar
            </button>
          </div>
        )}
      </div>

      <footer className="text-center text-xs opacity-50">
        Registro electrónico de jornada · Los datos se transmiten cifrados
      </footer>
    </main>
  );
}
