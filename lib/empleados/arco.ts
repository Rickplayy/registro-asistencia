"use server";

/**
 * Purga ARCO (Fase 5): borrado/anonimización de datos personales de un
 * empleado dado de baja, una vez cumplido el periodo de retención.
 *
 * Qué se ELIMINA: credenciales biométricas (facial y WebAuthn), métodos de
 * acceso, y todos los datos personales del expediente (nombre → anonimizado,
 * CURP/RFC/fecha de nacimiento/sexo/puesto/número a null).
 * Qué se CONSERVA: los registros de asistencia (obligación del registro
 * electrónico verificable, ya sin datos personales asociados) y los
 * consentimientos (evidencia legal del tratamiento que existió).
 * Detalle completo: docs/RETENCION-ARCO.md.
 */
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/db/server";
import { requerirAdmin } from "@/lib/auth/session";
import { auditar } from "@/lib/db/auditoria";
import { fechaMx } from "@/lib/asistencia/fechas";
import { evaluarPurga } from "./retencion";

export type PurgaResult = { ok: true } | { ok: false; error: string };

export async function purgarEmpleado(empleadoId: string): Promise<PurgaResult> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) {
    return { ok: false, error: "Tu perfil no está ligado a una empresa." };
  }
  if (perfil.rol !== "admin_empresa" && perfil.rol !== "super_admin") {
    return {
      ok: false,
      error: "Solo el administrador de la empresa puede purgar datos (ARCO).",
    };
  }

  const supabase = await createClient();
  const { data: empleado } = await supabase
    .from("empleados")
    .select("id, estatus, fecha_baja")
    .eq("id", empleadoId)
    .eq("empresa_id", perfil.empresa_id)
    .maybeSingle();
  if (!empleado) return { ok: false, error: "Empleado no encontrado." };

  const veredicto = evaluarPurga(
    empleado.estatus,
    empleado.fecha_baja,
    fechaMx(),
  );
  if (!veredicto.purgable) {
    return { ok: false, error: veredicto.motivo };
  }

  // 1) Fuera credenciales y métodos de acceso (RLS acota a MI empresa).
  await supabase
    .from("credenciales_biometricas")
    .delete()
    .eq("empleado_id", empleadoId)
    .eq("empresa_id", perfil.empresa_id);
  await supabase
    .from("credenciales_webauthn")
    .delete()
    .eq("empleado_id", empleadoId)
    .eq("empresa_id", perfil.empresa_id);
  await supabase
    .from("metodos_acceso")
    .delete()
    .eq("empleado_id", empleadoId)
    .eq("empresa_id", perfil.empresa_id);

  // 2) Anonimización del expediente (el registro de asistencia se conserva
  //    por obligación legal, pero ya no apunta a ningún dato personal).
  const { error } = await supabase
    .from("empleados")
    .update({
      nombre: `Empleado purgado ${empleadoId.slice(0, 8)}`,
      puesto: null,
      numero_empleado: null,
      curp_cifrado: null,
      rfc_cifrado: null,
      fecha_nacimiento_cifrada: null,
      sexo: null,
    })
    .eq("id", empleadoId)
    .eq("empresa_id", perfil.empresa_id);
  if (error)
    return { ok: false, error: "No se pudo anonimizar el expediente." };

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: "empleado.purga_arco",
    entidad: "empleados",
    entidadId: empleadoId,
    detalles: { fecha_baja: empleado.fecha_baja },
  });

  revalidatePath("/empleados");
  revalidatePath(`/empleados/${empleadoId}`);
  return { ok: true };
}
