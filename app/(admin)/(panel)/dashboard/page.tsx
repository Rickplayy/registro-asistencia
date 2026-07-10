import type { Metadata } from "next";
import Link from "next/link";

import { requerirAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { fechaMx } from "@/lib/asistencia/fechas";
import {
  esRetardo,
  primerasEntradas,
  resumenDelDia,
  type RegistroDia,
} from "@/lib/asistencia/reporte";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Dashboard · Registro de Asistencia",
};

const ETIQUETA_METODO: Record<string, string> = {
  pin: "PIN",
  qr: "QR",
  facial: "Facial",
  huella: "Huella",
};

/** Vista 8.3 — Dashboard administrativo: estado del día en < 3 segundos. */
export default async function DashboardPage() {
  const { perfil } = await requerirAdmin();
  const supabase = await createClient();
  const hoy = fechaMx();

  const [{ data: empresa }, { count: totalActivos }, { data: registrosHoy }] =
    await Promise.all([
      supabase
        .from("empresas")
        .select("hora_entrada, tolerancia_retardo_minutos")
        .eq("id", perfil.empresa_id ?? "")
        .maybeSingle(),
      supabase
        .from("empleados")
        .select("id", { count: "exact", head: true })
        .eq("estatus", "activo"),
      supabase
        .from("registros_asistencia")
        .select(
          "id, empleado_id, metodo, tipo, fecha, hora, registrado_en, empleados(nombre)",
        )
        .eq("fecha", hoy)
        .order("registrado_en", { ascending: false }),
    ]);

  const jornada = {
    hora_entrada: empresa?.hora_entrada ?? "09:00:00",
    tolerancia_retardo_minutos: empresa?.tolerancia_retardo_minutos ?? 15,
  };

  const registros: RegistroDia[] = (registrosHoy ?? []).map((r) => ({
    empleado_id: r.empleado_id,
    fecha: r.fecha,
    hora: r.hora,
    tipo: r.tipo as "entrada" | "salida",
  }));

  const resumen = resumenDelDia(registros, totalActivos ?? 0, jornada);
  const primeras = primerasEntradas(registros);
  const recientes = (registrosHoy ?? []).slice(0, 10);

  const tarjetas = [
    { titulo: "Presentes", valor: resumen.presentes, tono: "text-success" },
    { titulo: "Retardos", valor: resumen.retardos, tono: "text-warning" },
    { titulo: "Faltas", valor: resumen.faltas, tono: "text-destructive" },
    {
      titulo: "Empleados activos",
      valor: resumen.totalActivos,
      tono: "text-brand",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brand">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Hoy, {hoy}</p>
        </div>
        <Button render={<Link href="/empleados/nuevo" />}>
          + Alta de empleado
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tarjetas.map((t) => (
          <Card key={t.titulo}>
            <CardHeader>
              <CardDescription>{t.titulo}</CardDescription>
              <CardTitle className={`text-3xl ${t.tono}`}>{t.valor}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registros recientes</CardTitle>
          <CardDescription>
            Últimas marcaciones de hoy. Los retardos se resaltan en ámbar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recientes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aún no hay marcaciones hoy. Abre el kiosko para registrar la
              primera.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Hora</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recientes.map((r) => {
                  const nombre =
                    (r.empleados as unknown as { nombre: string })?.nombre ??
                    "—";
                  const esPrimeraEntrada =
                    r.tipo === "entrada" &&
                    primeras.get(r.empleado_id) === r.hora;
                  const conRetardo =
                    esPrimeraEntrada && esRetardo(r.hora, jornada);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{nombre}</TableCell>
                      <TableCell className="capitalize">{r.tipo}</TableCell>
                      <TableCell>
                        {ETIQUETA_METODO[r.metodo] ?? r.metodo}
                      </TableCell>
                      <TableCell>{r.hora.slice(0, 5)}</TableCell>
                      <TableCell>
                        {conRetardo ? (
                          <Badge className="bg-warning text-warning-foreground">
                            Retardo
                          </Badge>
                        ) : r.tipo === "entrada" && esPrimeraEntrada ? (
                          <Badge className="bg-success text-success-foreground">
                            A tiempo
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
