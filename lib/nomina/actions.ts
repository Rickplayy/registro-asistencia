"use server";

/**
 * Server Actions del módulo de nómina (Fase 6).
 * Reglas: tope ≤30 validado en backend (y CHECK en base); salarios es
 * histórico (el cambio cierra vigencia e inserta); aprobación de bonos
 * SIEMPRE humana y auditada.
 */
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/db/server";
import { requerirAdmin } from "@/lib/auth/session";
import { auditar } from "@/lib/db/auditoria";
import { fechaMx } from "@/lib/asistencia/fechas";
import { TOPE_DESCUENTO_LEGAL_PCT } from "./calculo";

export type NominaActionResult = { ok: true } | { ok: false; error: string };

// ----------------------------------------------------------------------------
// Salarios (histórico)
// ----------------------------------------------------------------------------
export async function registrarSalario(
  empleadoId: string,
  _prev: NominaActionResult | undefined,
  formData: FormData,
): Promise<NominaActionResult> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) return { ok: false, error: "Perfil sin empresa." };

  const tipo = String(formData.get("tipo") ?? "");
  const monto = Number(formData.get("monto"));
  const vigenteDesde = String(formData.get("vigente_desde") ?? "") || fechaMx();

  if (tipo !== "hora" && tipo !== "dia") {
    return { ok: false, error: "Tipo de salario inválido (hora o día)." };
  }
  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, error: "El monto debe ser mayor a cero." };
  }

  const supabase = await createClient();

  // Histórico: cerrar la vigencia del salario anterior (nunca se sobrescribe).
  const { data: anterior } = await supabase
    .from("salarios")
    .select("id, vigente_desde")
    .eq("empleado_id", empleadoId)
    .is("vigente_hasta", null)
    .maybeSingle();
  if (anterior) {
    if (anterior.vigente_desde >= vigenteDesde) {
      return {
        ok: false,
        error: `La nueva vigencia debe ser posterior a la actual (${anterior.vigente_desde}).`,
      };
    }
    const cierre = new Date(`${vigenteDesde}T00:00:00Z`);
    cierre.setUTCDate(cierre.getUTCDate() - 1);
    await supabase
      .from("salarios")
      .update({ vigente_hasta: cierre.toISOString().slice(0, 10) })
      .eq("id", anterior.id);
  }

  const { error } = await supabase.from("salarios").insert({
    empleado_id: empleadoId,
    empresa_id: perfil.empresa_id,
    tipo,
    monto,
    vigente_desde: vigenteDesde,
  });
  if (error) return { ok: false, error: "No se pudo registrar el salario." };

  // Histórico salarial visible en auditoría (sección 11.4).
  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: "salario.alta",
    entidad: "salarios",
    entidadId: empleadoId,
    detalles: { tipo, monto, vigente_desde: vigenteDesde },
  });

  revalidatePath(`/empleados/${empleadoId}`);
  revalidatePath("/nomina");
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Configuración de nómina (por empresa, dentro del margen legal)
// ----------------------------------------------------------------------------
export async function guardarConfigNomina(
  _prev: NominaActionResult | undefined,
  formData: FormData,
): Promise<NominaActionResult> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) return { ok: false, error: "Perfil sin empresa." };
  if (perfil.rol !== "admin_empresa" && perfil.rol !== "super_admin") {
    return {
      ok: false,
      error: "Solo el administrador puede configurar la nómina.",
    };
  }

  const tope = Number(formData.get("tope_descuento_pct"));
  const tolerancia = Number(formData.get("minutos_tolerancia"));
  const retardosFalta = Number(formData.get("retardos_antes_de_falta"));
  const faltasAlerta = Number(formData.get("faltas_alerta_30d"));
  const salarioMinimo = Number(formData.get("salario_minimo_diario"));
  const prima = formData.get("aplica_prima_dominical") === "on";

  // Art. 110 LFT: el tope configurable JAMÁS supera el 30% legal.
  if (!Number.isFinite(tope) || tope < 0 || tope > TOPE_DESCUENTO_LEGAL_PCT) {
    return {
      ok: false,
      error: `El tope de descuento debe estar entre 0 y ${TOPE_DESCUENTO_LEGAL_PCT}% (límite legal).`,
    };
  }
  if (!Number.isInteger(tolerancia) || tolerancia < 0 || tolerancia > 120) {
    return { ok: false, error: "Tolerancia inválida (0-120 minutos)." };
  }
  if (
    !Number.isInteger(retardosFalta) ||
    retardosFalta < 0 ||
    retardosFalta > 30
  ) {
    return {
      ok: false,
      error: "Retardos antes de falta inválido (0 = desactivado).",
    };
  }
  if (
    !Number.isInteger(faltasAlerta) ||
    faltasAlerta < 1 ||
    faltasAlerta > 30
  ) {
    return {
      ok: false,
      error: "El umbral de alerta de faltas debe ser al menos 1.",
    };
  }
  if (!Number.isFinite(salarioMinimo) || salarioMinimo <= 0) {
    return { ok: false, error: "Salario mínimo diario inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("configuracion_nomina").upsert(
    {
      empresa_id: perfil.empresa_id,
      tope_descuento_pct: tope,
      minutos_tolerancia: tolerancia,
      retardos_antes_de_falta: retardosFalta,
      faltas_alerta_30d: faltasAlerta,
      aplica_prima_dominical: prima,
      salario_minimo_diario: salarioMinimo,
    },
    { onConflict: "empresa_id" },
  );
  if (error)
    return { ok: false, error: "No se pudo guardar la configuración." };

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: "nomina.configuracion",
    entidad: "configuracion_nomina",
    entidadId: perfil.empresa_id,
    detalles: {
      tope,
      tolerancia,
      retardosFalta,
      faltasAlerta,
      prima,
      salarioMinimo,
    },
  });

  revalidatePath("/nomina");
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Bonos (catálogo)
// ----------------------------------------------------------------------------
export async function crearBono(
  _prev: NominaActionResult | undefined,
  formData: FormData,
): Promise<NominaActionResult> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) return { ok: false, error: "Perfil sin empresa." };
  if (perfil.rol !== "admin_empresa" && perfil.rol !== "super_admin") {
    return { ok: false, error: "Solo el administrador puede crear bonos." };
  }

  const nombre = String(formData.get("nombre") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "");
  const monto = Number(formData.get("monto_o_pct"));
  const condicion = String(formData.get("condicion") ?? "") || null;
  const requiereAprobacion = formData.get("requiere_aprobacion") === "on";

  if (!nombre) return { ok: false, error: "Ponle nombre al bono." };
  if (!["fijo", "porcentaje", "condicional"].includes(tipo)) {
    return { ok: false, error: "Tipo de bono inválido." };
  }
  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, error: "El monto/porcentaje debe ser mayor a cero." };
  }
  if (tipo === "porcentaje" && monto > 100) {
    return { ok: false, error: "Un porcentaje no puede exceder 100." };
  }
  if (
    tipo === "condicional" &&
    !["sin_faltas", "sin_retardos", "asistencia_perfecta"].includes(
      condicion ?? "",
    )
  ) {
    return { ok: false, error: "Elige la condición del bono condicional." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bonos")
    .insert({
      empresa_id: perfil.empresa_id,
      nombre,
      tipo,
      monto_o_pct: monto,
      condicion: tipo === "condicional" ? condicion : null,
      requiere_aprobacion: requiereAprobacion,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "No se pudo crear el bono." };

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: "bono.alta",
    entidad: "bonos",
    entidadId: data.id,
    detalles: { nombre, tipo, monto, requiereAprobacion },
  });

  revalidatePath("/nomina");
  return { ok: true };
}

export async function desactivarBono(
  bonoId: string,
): Promise<NominaActionResult> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) return { ok: false, error: "Perfil sin empresa." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bonos")
    .update({ activo: false })
    .eq("id", bonoId)
    .eq("empresa_id", perfil.empresa_id);
  if (error) return { ok: false, error: "No se pudo desactivar el bono." };

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: "bono.desactivacion",
    entidad: "bonos",
    entidadId: bonoId,
  });

  revalidatePath("/nomina");
  return { ok: true };
}

/**
 * Aprobación HUMANA de un bono con requiere_aprobacion para un empleado y
 * periodo. Queda en bonos_aprobaciones (quién) y en auditoria (sección 11.2).
 */
export async function aprobarBono(
  bonoId: string,
  empleadoId: string,
  desde: string,
  hasta: string,
): Promise<NominaActionResult> {
  const { perfil } = await requerirAdmin();
  if (!perfil.empresa_id) return { ok: false, error: "Perfil sin empresa." };
  if (perfil.rol !== "admin_empresa" && perfil.rol !== "super_admin") {
    return { ok: false, error: "Solo el administrador puede aprobar bonos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("bonos_aprobaciones").insert({
    empresa_id: perfil.empresa_id,
    bono_id: bonoId,
    empleado_id: empleadoId,
    periodo_desde: desde,
    periodo_hasta: hasta,
    aprobado_por: perfil.id,
  });
  if (error) {
    const duplicado = error.code === "23505";
    return {
      ok: false,
      error: duplicado
        ? "Ese bono ya estaba aprobado para el empleado en este periodo."
        : "No se pudo aprobar el bono.",
    };
  }

  await auditar(supabase, {
    usuarioAdminId: perfil.id,
    empresaId: perfil.empresa_id,
    accion: "bono.aprobacion",
    entidad: "bonos_aprobaciones",
    entidadId: bonoId,
    detalles: { empleado_id: empleadoId, periodo: `${desde} a ${hasta}` },
  });

  revalidatePath("/nomina");
  return { ok: true };
}
