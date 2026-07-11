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

  // Estado biométrico (solo metadatos, jamás plantillas ni claves). Todo
  // acceso a tablas de credenciales queda en auditoría, sin excepción.
  const [
    { data: credencialFacial },
    { count: huellas },
    { data: consentHuella },
  ] = await Promise.all([
    supabase
      .from("credenciales_biometricas")
      .select("id, created_at")
      .eq("empleado_id", empleado.id)
      .eq("tipo", "facial")
      .eq("vigente", true)
      .maybeSingle(),
    supabase
      .from("credenciales_webauthn")
      .select("id", { count: "exact", head: true })
      .eq("empleado_id", empleado.id)
      .eq("vigente", true),
    supabase
      .from("consentimientos")
      .select("id")
      .eq("empleado_id", empleado.id)
      .eq("tipo_dato", "biometrico_huella")
      .eq("otorgado", true)
      .is("revocado_en", null)
      .limit(1)
      .maybeSingle(),
  ]);
  if (perfil.empresa_id) {
    await auditar(supabase, {
      usuarioAdminId: perfil.id,
      empresaId: perfil.empresa_id,
      accion: "biometria.lectura_credenciales",
      entidad: "credenciales_biometricas+credenciales_webauthn",
      entidadId: empleado.id,
      detalles: { alcance: "metadatos", contexto: "ficha_empleado" },
    });
  }

  return (
    <FichaEmpleado
      rostroEnroladoDesde={credencialFacial?.created_at ?? null}
      huellasActivas={huellas ?? 0}
      consentimientoHuella={Boolean(consentHuella)}
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
