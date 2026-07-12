import type { Metadata } from "next";
import Link from "next/link";

import { requerirAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { auditar } from "@/lib/db/auditoria";
import { fechaValida, inicioDeMes } from "@/lib/asistencia/consultas";
import { fechaMx } from "@/lib/asistencia/fechas";
import { obtenerProyeccion } from "@/lib/nomina/consultas";
import { COLUMNAS_NOMINA, filasNomina } from "@/lib/nomina/columnas";
import { textoCelda } from "@/lib/reportes/tipos";
import { obtenerPlan } from "@/lib/planes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BonosAdmin, BonosPendientes, ConfigNominaForm } from "./nomina-ui";

export const metadata: Metadata = {
  title: "Proyección de nómina · Registro de Asistencia",
};

/** Formatos de exportación de nómina (sección 11.3). */
const FORMATOS = [
  { formato: "xlsx", etiqueta: "Excel" },
  { formato: "csv", etiqueta: "CSV" },
  { formato: "sql", etiqueta: "SQL" },
];

/**
 * Vista 8.6 — Proyección de nómina / incidencias.
 * Es una vista de REVISIÓN: nada se exporta ni se paga sin que un humano lo
 * haya visto aquí primero (los botones de exportar solo existen aquí).
 */
export default async function NominaPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const sp = await searchParams;
  const desde = fechaValida(sp.desde ?? null) ?? inicioDeMes();
  const hasta = fechaValida(sp.hasta ?? null) ?? fechaMx();

  const { perfil } = await requerirAdmin();
  const supabase = await createClient();
  const { data: empresa } = await supabase
    .from("empresas")
    .select("plan")
    .maybeSingle();
  const plan = obtenerPlan(empresa?.plan);

  if (!plan.nomina) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold text-brand">
          Proyección de nómina
        </h1>
        <Alert>
          <AlertTitle>Disponible en los planes Pro y Enterprise</AlertTitle>
          <AlertDescription>
            El módulo de incidencias y proyección de nómina no está incluido en
            tu plan {plan.nombre}.{" "}
            <Link href="/plan" className="underline">
              Mejora tu plan
            </Link>{" "}
            para activarlo.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const proyeccion = await obtenerProyeccion(desde, hasta);
  const { data: bonos } = await supabase
    .from("bonos")
    .select("id, nombre, tipo, monto_o_pct, condicion, requiere_aprobacion")
    .eq("activo", true)
    .order("nombre");

  // Toda consulta con datos personales+salariales queda en auditoría.
  if (perfil.empresa_id) {
    await auditar(supabase, {
      usuarioAdminId: perfil.id,
      empresaId: perfil.empresa_id,
      accion: "nomina.consulta",
      entidad: "incidencias",
      detalles: { desde, hasta, empleados: proyeccion.filas.length },
    });
  }

  const puedeAdministrar =
    perfil.rol === "admin_empresa" || perfil.rol === "super_admin";
  const datos = filasNomina(proyeccion.filas);
  const urlExport = (formato: string) =>
    `/api/nomina/export?desde=${desde}&hasta=${hasta}&formato=${formato}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-brand">
            Proyección de nómina / incidencias
          </h1>
          <p className="text-sm text-muted-foreground">
            Vista de revisión humana: calcula y proyecta — no timbra CFDI ni
            paga. Exporta el insumo para tu sistema de nómina o contador.
          </p>
        </div>
        <div className="flex gap-2">
          {FORMATOS.map((f, i) => (
            <Button
              key={f.formato}
              variant={i === 0 ? "default" : "outline"}
              render={<a href={urlExport(f.formato)} />}
            >
              Exportar {f.etiqueta}
            </Button>
          ))}
        </div>
      </div>

      {/* Alerta de faltas (solo alerta; la decisión es humana — sección 2.3) */}
      {proyeccion.alertasFaltas.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>
            Alerta: empleados con {proyeccion.config.faltas_alerta_30d}+ faltas
            en 30 días
          </AlertTitle>
          <AlertDescription>
            {proyeccion.alertasFaltas
              .map((a) => `${a.nombre} (${a.faltas30d} faltas)`)
              .join(" · ")}
            {" — "}más de 3 faltas injustificadas en 30 días puede ser causal de
            rescisión (Art. 47 LFT). El sistema NO ejecuta ninguna acción:
            revisa cada caso con RH.
          </AlertDescription>
        </Alert>
      )}

      <BonosPendientes
        pendientes={proyeccion.bonosPendientes}
        desde={desde}
        hasta={hasta}
        puedeAprobar={puedeAdministrar}
      />

      <Card>
        <CardContent className="space-y-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="desde">Desde</Label>
              <Input
                id="desde"
                name="desde"
                type="date"
                defaultValue={desde}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hasta">Hasta</Label>
              <Input
                id="hasta"
                name="hasta"
                type="date"
                defaultValue={hasta}
                className="w-40"
              />
            </div>
            <Button type="submit" variant="secondary">
              Aplicar periodo
            </Button>
          </form>

          {proyeccion.sinSalario.length > 0 && (
            <Alert>
              <AlertDescription>
                Sin salario capturado (no aparecen en la proyección):{" "}
                {proyeccion.sinSalario.map((s) => s.nombre).join(", ")} —
                captúralo desde su ficha.
              </AlertDescription>
            </Alert>
          )}

          {datos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin empleados proyectables en el periodo. Captura salarios en las
              fichas de los empleados.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNAS_NOMINA.map((c) => (
                    <TableHead
                      key={c.clave}
                      className={
                        c.alineacion === "derecha" ? "text-right" : undefined
                      }
                    >
                      {c.titulo}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.map((fila, i) => (
                  <TableRow key={proyeccion.filas[i].empleadoId}>
                    {COLUMNAS_NOMINA.map((c) => (
                      <TableCell
                        key={c.clave}
                        className={
                          c.alineacion === "derecha"
                            ? "text-right tabular-nums"
                            : c.clave === "nombre"
                              ? "font-medium"
                              : undefined
                        }
                      >
                        {c.clave === "faltas" && Number(fila.faltas) > 0 ? (
                          <Badge className="bg-destructive text-white">
                            {textoCelda(c, fila)}
                          </Badge>
                        ) : c.clave === "retardos" &&
                          Number(fila.retardos) > 0 ? (
                          <Badge className="bg-warning text-warning-foreground">
                            {textoCelda(c, fila)}
                          </Badge>
                        ) : (
                          textoCelda(c, fila)
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <ConfigNominaForm
          config={proyeccion.config}
          puedeEditar={puedeAdministrar}
        />
        <BonosAdmin bonos={bonos ?? []} puedeEditar={puedeAdministrar} />
      </div>
    </div>
  );
}
