import type { Metadata } from "next";

import { requerirAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { obtenerPlan } from "@/lib/planes";
import { ConfiguracionForm } from "./configuracion-form";
import { MarcaForm } from "./marca-form";

export const metadata: Metadata = {
  title: "Configuración · Registro de Asistencia",
};

export default async function ConfiguracionPage() {
  const { perfil } = await requerirAdmin();
  const supabase = await createClient();

  const { data: empresa } = await supabase
    .from("empresas")
    .select(
      "nombre, rfc_empresa, hora_entrada, hora_salida, tolerancia_retardo_minutos, config_metodos_habilitados, plan, logo_data_url, color_marca",
    )
    .eq("id", perfil.empresa_id ?? "")
    .maybeSingle();

  if (!empresa) {
    return (
      <p className="text-sm text-muted-foreground">
        Tu perfil no está ligado a una empresa.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Datos de la empresa, jornada de referencia y métodos de registro.
        </p>
      </div>
      <ConfiguracionForm
        empresa={{
          nombre: empresa.nombre,
          rfc_empresa: empresa.rfc_empresa,
          hora_entrada: String(empresa.hora_entrada).slice(0, 5),
          hora_salida: String(empresa.hora_salida).slice(0, 5),
          tolerancia_retardo_minutos: empresa.tolerancia_retardo_minutos,
          metodos: (empresa.config_metodos_habilitados as string[]) ?? [],
        }}
        puedeEditar={
          perfil.rol === "admin_empresa" || perfil.rol === "super_admin"
        }
      />
      <MarcaForm
        colorActual={empresa.color_marca}
        logoActual={empresa.logo_data_url}
        permitido={obtenerPlan(empresa.plan).whiteLabel}
      />
    </div>
  );
}
