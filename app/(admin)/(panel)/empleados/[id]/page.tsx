import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requerirAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { auditar } from "@/lib/db/auditoria";
import { decryptNullable } from "@/lib/crypto";
import { FichaEmpleado } from "./ficha-empleado";

export const metadata: Metadata = {
  title: "Ficha de empleado · Registro de Asistencia",
};

export default async function EmpleadoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { perfil } = await requerirAdmin();
  const supabase = await createClient();

  const { data: empleado } = await supabase
    .from("empleados")
    .select(
      "id, nombre, puesto, numero_empleado, sexo, estatus, fecha_ingreso, curp_cifrado, rfc_cifrado, fecha_nacimiento_cifrada",
    )
    .eq("id", id)
    .maybeSingle();

  if (!empleado) notFound();

  // Acceso a datos sensibles descifrados: queda en auditoría (sección 6).
  const hayDatosSensibles = Boolean(
    empleado.curp_cifrado ||
    empleado.rfc_cifrado ||
    empleado.fecha_nacimiento_cifrada,
  );
  if (hayDatosSensibles && perfil.empresa_id) {
    await auditar(supabase, {
      usuarioAdminId: perfil.id,
      empresaId: perfil.empresa_id,
      accion: "empleado.lectura_datos_sensibles",
      entidad: "empleados",
      entidadId: empleado.id,
    });
  }

  return (
    <FichaEmpleado
      empleado={{
        id: empleado.id,
        nombre: empleado.nombre,
        puesto: empleado.puesto,
        numero_empleado: empleado.numero_empleado,
        sexo: empleado.sexo,
        estatus: empleado.estatus,
        fecha_ingreso: empleado.fecha_ingreso,
        curp: decryptNullable(empleado.curp_cifrado),
        rfc: decryptNullable(empleado.rfc_cifrado),
        fecha_nacimiento: decryptNullable(empleado.fecha_nacimiento_cifrada),
      }}
    />
  );
}
