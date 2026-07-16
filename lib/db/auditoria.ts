/**
 * Bitácora de auditoría (sección 6): registra altas/bajas/cambios y accesos a
 * datos sensibles. Es "best effort": un fallo al auditar se reporta en consola
 * pero no revienta la operación de negocio (la tabla es INSERT-only vía RLS).
 */
import type { ClienteDatos } from "@/lib/local/client";

export type AccionAuditoria =
  | "empleado.alta"
  | "empleado.actualizacion"
  | "empleado.baja"
  | "empleado.reactivacion"
  | "empleado.lectura_datos_sensibles"
  | "empleado.regeneracion_pin"
  | "empleado.regeneracion_qr"
  | "empresa.alta"
  | "empresa.actualizacion"
  | "dispositivo.alta"
  | "dispositivo.desactivacion";

export async function auditar(
  supabase: ClienteDatos,
  entrada: {
    usuarioAdminId: string;
    empresaId: string;
    accion: AccionAuditoria;
    entidad: string;
    entidadId?: string;
    detalles?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("auditoria").insert({
    usuario_admin_id: entrada.usuarioAdminId,
    empresa_id: entrada.empresaId,
    accion: entrada.accion,
    entidad_afectada: entrada.entidad,
    entidad_id: entrada.entidadId ?? null,
    detalles: entrada.detalles ?? null,
  });
  if (error) {
    console.error(`[auditoria] no se pudo registrar ${entrada.accion}:`, error);
  }
}
