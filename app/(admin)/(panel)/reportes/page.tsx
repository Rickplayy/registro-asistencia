import type { Metadata } from "next";

import { requerirAdmin } from "@/lib/auth/session";
import { auditar } from "@/lib/db/auditoria";
import {
  fechaValida,
  inicioDeMes,
  obtenerReporte,
} from "@/lib/asistencia/consultas";
import { fechaMx } from "@/lib/asistencia/fechas";
import { COLUMNAS_ASISTENCIA, filasAsistencia } from "@/lib/reportes/columnas";
import { formatosDisponibles } from "@/lib/reportes/adaptadores";
import { textoCelda } from "@/lib/reportes/tipos";
import { createClient } from "@/lib/db/server";
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
 * Vista 8.5 — Reportes de asistencia (Fase 4, cumplimiento STPS).
 *
 * Los encabezados y celdas se generan desde COLUMNAS_ASISTENCIA (la misma
 * definición que usan los exportadores): agregar una columna cuando la STPS
 * publique su formato NO requiere tocar esta vista. Las celdas de retardos y
 * faltas conservan su resaltado ámbar/rojo vía el mapa de realces.
 */
export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const sp = await searchParams;
  const desde = fechaValida(sp.desde ?? null) ?? inicioDeMes();
  const hasta = fechaValida(sp.hasta ?? null) ?? fechaMx();

  const { perfil } = await requerirAdmin();
  const { filas } = await obtenerReporte(desde, hasta);

  // Toda consulta de reportes con datos personales queda en auditoría (Fase 4).
  if (perfil.empresa_id) {
    const supabase = await createClient();
    await auditar(supabase, {
      usuarioAdminId: perfil.id,
      empresaId: perfil.empresa_id,
      accion: "reporte.consulta",
      entidad: "registros_asistencia",
      detalles: { desde, hasta, empleados: filas.length },
    });
  }

  const datos = filasAsistencia(filas);
  const urlExport = (formato: string) =>
    `/api/reportes/asistencia?desde=${desde}&hasta=${hasta}&formato=${formato}`;

  // Realce visual por columna (verde/ámbar/rojo — convención de la sección 7).
  const realce: Record<
    string,
    (v: number) => "warning" | "destructive" | null
  > = {
    retardos: (v) => (v > 0 ? "warning" : null),
    faltas: (v) => (v > 0 ? "destructive" : null),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-brand">
            Reportes de asistencia
          </h1>
          <p className="text-sm text-muted-foreground">
            Días trabajados, retardos, faltas y horas por empleado. Toda
            exportación queda auditada.
          </p>
        </div>
        {/* Exportar: la acción más frecuente, siempre visible (sección 8.5).
            Los formatos vienen del registro de adaptadores. */}
        <div className="flex gap-2">
          {formatosDisponibles().map((f, i) => (
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

          {datos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay empleados activos con datos en este periodo.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNAS_ASISTENCIA.map((c) => (
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
                  <TableRow key={filas[i].empleadoId}>
                    {COLUMNAS_ASISTENCIA.map((c) => {
                      const tono = realce[c.clave]?.(Number(fila[c.clave]));
                      return (
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
                          {tono === "warning" ? (
                            <Badge className="bg-warning text-warning-foreground">
                              {textoCelda(c, fila)}
                            </Badge>
                          ) : tono === "destructive" ? (
                            <Badge className="bg-destructive text-white">
                              {textoCelda(c, fila)}
                            </Badge>
                          ) : (
                            textoCelda(c, fila)
                          )}
                        </TableCell>
                      );
                    })}
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
