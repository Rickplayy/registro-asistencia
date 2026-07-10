import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/db/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Empleados · Registro de Asistencia",
};

const TONO_ESTATUS: Record<string, string> = {
  activo: "bg-success text-success-foreground",
  inactivo: "bg-warning text-warning-foreground",
  baja: "bg-destructive text-white",
};

export default async function EmpleadosPage() {
  const supabase = await createClient();
  const { data: empleados } = await supabase
    .from("empleados")
    .select("id, nombre, puesto, numero_empleado, estatus, fecha_ingreso")
    .order("nombre");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brand">Empleados</h1>
          <p className="text-sm text-muted-foreground">
            {empleados?.length ?? 0} en total
          </p>
        </div>
        <Button render={<Link href="/empleados/nuevo" />}>
          + Alta de empleado
        </Button>
      </div>

      <Card>
        <CardContent>
          {!empleados || empleados.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aún no hay empleados. Da de alta al primero para poder registrar
              asistencia.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Puesto</TableHead>
                  <TableHead>No. empleado</TableHead>
                  <TableHead>Ingreso</TableHead>
                  <TableHead>Estatus</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {empleados.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.nombre}</TableCell>
                    <TableCell>{e.puesto ?? "—"}</TableCell>
                    <TableCell>{e.numero_empleado ?? "—"}</TableCell>
                    <TableCell>{e.fecha_ingreso ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        className={TONO_ESTATUS[e.estatus] ?? ""}
                        variant="secondary"
                      >
                        {e.estatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        render={<Link href={`/empleados/${e.id}`} />}
                      >
                        Ver
                      </Button>
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
