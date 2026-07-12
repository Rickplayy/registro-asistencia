"use client";

/** Componentes interactivos de la vista de nómina (Fase 6). */
import { useActionState, useState, useTransition } from "react";

import {
  aprobarBono,
  crearBono,
  desactivarBono,
  guardarConfigNomina,
  type NominaActionResult,
} from "@/lib/nomina/actions";
import type { BonoPendiente } from "@/lib/nomina/consultas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

// ----------------------------------------------------------------------------
// Aprobación humana de bonos (queda en bonos_aprobaciones + auditoria)
// ----------------------------------------------------------------------------
export function BonosPendientes({
  pendientes,
  desde,
  hasta,
  puedeAprobar,
}: {
  pendientes: BonoPendiente[];
  desde: string;
  hasta: string;
  puedeAprobar: boolean;
}) {
  const [enTransicion, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (pendientes.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bonos pendientes de aprobación</CardTitle>
        <CardDescription>
          Estos bonos requieren aprobación humana para aplicarse en el periodo —
          quién aprueba queda registrado en auditoría.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {pendientes.map((p) => (
          <div
            key={`${p.bonoId}:${p.empleadoId}`}
            className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
          >
            <span>
              <strong>{p.bonoNombre}</strong> · {p.empleadoNombre}
            </span>
            <Button
              size="sm"
              disabled={!puedeAprobar || enTransicion}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const res = await aprobarBono(
                    p.bonoId,
                    p.empleadoId,
                    desde,
                    hasta,
                  );
                  if (res.ok) window.location.reload();
                  else setError(res.error);
                })
              }
            >
              Aprobar para este periodo
            </Button>
          </div>
        ))}
        {!puedeAprobar && (
          <p className="text-xs text-muted-foreground">
            Solo el administrador de la empresa puede aprobar bonos.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Configuración de nómina (dentro del margen legal, sección 11.2)
// ----------------------------------------------------------------------------
export function ConfigNominaForm({
  config,
  puedeEditar,
}: {
  config: {
    tope_descuento_pct: number;
    minutos_tolerancia: number;
    retardos_antes_de_falta: number;
    faltas_alerta_30d: number;
    aplica_prima_dominical: boolean;
    salario_minimo_diario: number;
  };
  puedeEditar: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    NominaActionResult | undefined,
    FormData
  >(guardarConfigNomina, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Política de nómina</CardTitle>
        <CardDescription>
          Ajustable solo dentro del margen legal: el tope de descuento jamás
          puede superar el 30% (Art. 110 LFT) y los retardos nunca se descuentan
          en pesos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state && !state.ok && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state?.ok && (
            <Alert>
              <AlertDescription>Política guardada.</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="tope">Tope de descuento (% máx. 30)</Label>
              <Input
                id="tope"
                name="tope_descuento_pct"
                type="number"
                min={0}
                max={30}
                step="0.5"
                defaultValue={config.tope_descuento_pct}
                disabled={!puedeEditar}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tolerancia_nomina">Tolerancia (min)</Label>
              <Input
                id="tolerancia_nomina"
                name="minutos_tolerancia"
                type="number"
                min={0}
                max={120}
                defaultValue={config.minutos_tolerancia}
                disabled={!puedeEditar}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="retardos_falta">
                Retardos = 1 falta (0 desactiva)
              </Label>
              <Input
                id="retardos_falta"
                name="retardos_antes_de_falta"
                type="number"
                min={0}
                max={30}
                defaultValue={config.retardos_antes_de_falta}
                disabled={!puedeEditar}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="faltas_alerta">Alerta de faltas (30 días)</Label>
              <Input
                id="faltas_alerta"
                name="faltas_alerta_30d"
                type="number"
                min={1}
                max={30}
                defaultValue={config.faltas_alerta_30d}
                disabled={!puedeEditar}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="salario_minimo">Salario mínimo diario ($)</Label>
              <Input
                id="salario_minimo"
                name="salario_minimo_diario"
                type="number"
                min={1}
                step="0.01"
                defaultValue={config.salario_minimo_diario}
                disabled={!puedeEditar}
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                name="aplica_prima_dominical"
                defaultChecked={config.aplica_prima_dominical}
                disabled={!puedeEditar}
              />
              Prima dominical (25%)
            </label>
          </div>
          {puedeEditar && (
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar política"}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Catálogo de bonos
// ----------------------------------------------------------------------------
export function BonosAdmin({
  bonos,
  puedeEditar,
}: {
  bonos: {
    id: string;
    nombre: string;
    tipo: string;
    monto_o_pct: number;
    condicion: string | null;
    requiere_aprobacion: boolean;
  }[];
  puedeEditar: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    NominaActionResult | undefined,
    FormData
  >(crearBono, undefined);
  const [tipo, setTipo] = useState("fijo");
  const [enTransicion, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bonos configurables</CardTitle>
        <CardDescription>
          Fijos, porcentaje del pago base, o condicionados a la asistencia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {bonos.length > 0 && (
          <ul className="space-y-2">
            {bonos.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <span>
                  <strong>{b.nombre}</strong> ·{" "}
                  {b.tipo === "porcentaje"
                    ? `${b.monto_o_pct}% del pago base`
                    : `$${Number(b.monto_o_pct).toFixed(2)}`}
                  {b.condicion && ` · ${b.condicion.replace(/_/g, " ")}`}{" "}
                  {b.requiere_aprobacion && (
                    <Badge variant="secondary">requiere aprobación</Badge>
                  )}
                </span>
                {puedeEditar && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={enTransicion}
                    onClick={() =>
                      startTransition(async () => {
                        setError(null);
                        const res = await desactivarBono(b.id);
                        if (res.ok) window.location.reload();
                        else setError(res.error);
                      })
                    }
                  >
                    Desactivar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {puedeEditar && (
          <form action={formAction} className="space-y-3 rounded-lg border p-3">
            {state && !state.ok && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            <p className="text-sm font-medium">Nuevo bono</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="bono_nombre">Nombre *</Label>
                <Input id="bono_nombre" name="nombre" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bono_tipo">Tipo</Label>
                <select
                  id="bono_tipo"
                  name="tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  className="border-input bg-background flex h-8 w-full rounded-lg border px-2.5 text-sm"
                >
                  <option value="fijo">Monto fijo ($)</option>
                  <option value="porcentaje">% del pago base</option>
                  <option value="condicional">Condicional ($)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="bono_monto">
                  {tipo === "porcentaje" ? "Porcentaje" : "Monto ($)"} *
                </Label>
                <Input
                  id="bono_monto"
                  name="monto_o_pct"
                  type="number"
                  min={0.01}
                  step="0.01"
                  required
                />
              </div>
              {tipo === "condicional" && (
                <div className="space-y-1">
                  <Label htmlFor="bono_condicion">Condición</Label>
                  <select
                    id="bono_condicion"
                    name="condicion"
                    className="border-input bg-background flex h-8 w-full rounded-lg border px-2.5 text-sm"
                  >
                    <option value="sin_faltas">Sin faltas</option>
                    <option value="sin_retardos">Sin retardos</option>
                    <option value="asistencia_perfecta">
                      Asistencia perfecta
                    </option>
                  </select>
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="requiere_aprobacion" /> Requiere
              aprobación humana antes de aplicarse
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear bono"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
