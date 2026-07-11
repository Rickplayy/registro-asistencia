/**
 * Consulta compartida del reporte de asistencia (página 8.5 y exportaciones).
 * Usa el cliente de sesión: RLS acota todo a la empresa del usuario.
 */
import { createClient } from "@/lib/db/server";
import { fechaMx } from "./fechas";
import {
  reporteAsistencia,
  type FilaReporte,
  type RegistroDia,
} from "./reporte";

export type DatosReporte = {
  filas: FilaReporte[];
  desde: string;
  hasta: string;
  empresaNombre: string;
};

/** Primer día del mes actual (CDMX). */
export function inicioDeMes(): string {
  return `${fechaMx().slice(0, 7)}-01`;
}

export async function obtenerReporte(
  desde: string,
  hasta: string,
): Promise<DatosReporte> {
  const supabase = await createClient();

  const [{ data: empresa }, { data: empleados }, { data: registros }] =
    await Promise.all([
      supabase
        .from("empresas")
        .select("nombre, hora_entrada, tolerancia_retardo_minutos")
        .maybeSingle(),
      supabase
        .from("empleados")
        .select("id, nombre, puesto")
        .eq("estatus", "activo")
        .order("nombre"),
      supabase
        .from("registros_asistencia")
        .select("empleado_id, fecha, hora, tipo")
        .gte("fecha", desde)
        .lte("fecha", hasta),
    ]);

  const filas = reporteAsistencia(
    empleados ?? [],
    (registros ?? []) as RegistroDia[],
    desde,
    hasta,
    {
      hora_entrada: empresa?.hora_entrada ?? "09:00:00",
      tolerancia_retardo_minutos: empresa?.tolerancia_retardo_minutos ?? 15,
    },
    fechaMx(),
  );

  return { filas, desde, hasta, empresaNombre: empresa?.nombre ?? "" };
}

/** Valida un parámetro de fecha "YYYY-MM-DD"; regresa null si es inválido. */
export function fechaValida(valor: string | null): string | null {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null;
}
