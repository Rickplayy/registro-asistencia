"use client";

import { useState } from "react";

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

/** Pantalla de vinculación: se ve una sola vez por aparato. */
export function KioskoVincular() {
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function vincular(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/kiosko/vincular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: clave.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo vincular.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Sin conexión con el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Vincular este kiosko</CardTitle>
          <CardDescription>
            Pega la clave de vinculación que generó tu administrador en Panel →
            Dispositivos. Se guarda solo en este aparato.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={vincular} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="clave">Clave de vinculación</Label>
              <Input
                id="clave"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder="RA-KIOSKO-…"
                className="font-mono"
                autoFocus
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando ? "Vinculando…" : "Vincular kiosko"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
