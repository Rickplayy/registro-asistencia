import type { Metadata } from "next";

import {
  fechaValida,
  inicioDeMes,
  obtenerReporte,
} from "@/lib/asistencia/consultas";
import { fechaMx } from "@/lib/asistencia/fechas";
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

export const metadata: Metadata = {
  title: "Reportes · Registro de Asistencia",
};

/**
 * Vista 8.5 — Reportes de asistencia con exportación siempre visible.
 * El formato oficial STPS llega en la Fase 4; la tabla admite columnas nuevas
 * sin rediseñar.
 */
export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const sp = await searchParams;
  const desde = fechaValida(sp.desde ?? null) ?? inicioDeMes();
  const hasta = fechaValida(sp.hasta ?? null) ?? fechaMx();
  const { filas } = await obtenerReporte(desde, hasta);

  const urlExport = (formato: string) =>
    `/api/reportes/asistencia?desde=${desde}&hasta=${hasta}&formato=${formato}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-brand">
            Reportes de asistencia
          </h1>
          <p className="text-sm text-muted-foreground">
            Días trabajados, retardos, faltas y horas por empleado.
          </p>
        </div>
        {/* Exportar: la acción más frecuente, siempre visible (sección 8.5) */}
        <div className="flex gap-2">
          <Button render={<a href={urlExport("xlsx")} />}>
            Exportar Excel
          </Button>
          <Button variant="outline" render={<a href={urlExport("csv")} />}>
            Exportar CSV
          </Button>
        </div>
      </div>

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

          {filas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay empleados activos con datos en este periodo.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Puesto</TableHead>
                  <TableHead className="text-right">Días trabajados</TableHead>
                  <TableHead className="text-right">Retardos</TableHead>
                  <TableHead className="text-right">Faltas</TableHead>
                  <TableHead className="text-right">Horas totales</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f) => (
                  <TableRow key={f.empleadoId}>
                    <TableCell className="font-medium">{f.nombre}</TableCell>
                    <TableCell>{f.puesto || "—"}</TableCell>
                    <TableCell className="text-right">
                      {f.diasTrabajados}
                    </TableCell>
                    <TableCell className="text-right">
                      {f.retardos > 0 ? (
                        <Badge className="bg-warning text-warning-foreground">
                          {f.retardos}
                        </Badge>
                      ) : (
                        0
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {f.faltas > 0 ? (
                        <Badge className="bg-destructive text-white">
                          {f.faltas}
                        </Badge>
                      ) : (
                        0
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {f.horasTotales.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
