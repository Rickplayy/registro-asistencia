import type { Metadata } from "next";

import { createClient } from "@/lib/db/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AltaDispositivo, BotonDesactivar } from "./dispositivos-ui";

export const metadata: Metadata = {
  title: "Dispositivos · Registro de Asistencia",
};

export default async function DispositivosPage() {
  const supabase = await createClient();
  const { data: dispositivos } = await supabase
    .from("dispositivos")
    .select("id, nombre, tipo, ubicacion, activo, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brand">Dispositivos</h1>
          <p className="text-sm text-muted-foreground">
            Kioskos autorizados a registrar asistencia de tu empresa.
          </p>
        </div>
        <AltaDispositivo />
      </div>

      <Card>
        <CardContent>
          {!dispositivos || dispositivos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin dispositivos. Crea uno para obtener su clave de vinculación y
              conéctala en la pantalla del kiosko.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {dispositivos.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      {d.nombre ?? "—"}
                    </TableCell>
                    <TableCell className="capitalize">{d.tipo}</TableCell>
                    <TableCell>{d.ubicacion ?? "—"}</TableCell>
                    <TableCell>
                      {d.activo ? (
                        <Badge className="bg-success text-success-foreground">
                          activo
                        </Badge>
                      ) : (
                        <Badge variant="secondary">inactivo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {d.activo && <BotonDesactivar dispositivoId={d.id} />}
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
