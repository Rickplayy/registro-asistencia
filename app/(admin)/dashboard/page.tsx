import type { Metadata } from "next";

import { cerrarSesion } from "@/lib/auth/actions";
import { requerirAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Dashboard · Registro de Asistencia",
};

const ETIQUETA_ROL: Record<string, string> = {
  super_admin: "Super administrador",
  admin_empresa: "Administrador de empresa",
  rh: "Recursos Humanos",
  supervisor: "Supervisor",
};

/**
 * Vista 8.3 — Dashboard administrativo (esqueleto de Fase 0).
 * Las tarjetas resumen y la tabla de registros recientes se implementan en la
 * Fase 1 (MVP); aquí se valida el flujo completo de autenticación + RLS.
 */
export default async function DashboardPage() {
  const { perfil, email } = await requerirAdmin();

  // Esta consulta pasa por RLS: solo devuelve la empresa del usuario actual.
  const supabase = await createClient();
  const { data: empresa } = perfil.empresa_id
    ? await supabase
        .from("empresas")
        .select("nombre, plan")
        .eq("id", perfil.empresa_id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 flex-col bg-sidebar p-4 text-sidebar-foreground md:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-bold">
            RA
          </div>
          <span className="font-semibold">Registro de Asistencia</span>
        </div>
        <nav className="space-y-1 text-sm">
          <span className="block rounded-md bg-sidebar-accent px-3 py-2 font-medium">
            Dashboard
          </span>
          <span className="block cursor-not-allowed rounded-md px-3 py-2 opacity-50">
            Empleados (Fase 1)
          </span>
          <span className="block cursor-not-allowed rounded-md px-3 py-2 opacity-50">
            Reportes (Fase 1)
          </span>
          <span className="block cursor-not-allowed rounded-md px-3 py-2 opacity-50">
            Nómina (Fase 6)
          </span>
        </nav>
      </aside>

      <main className="flex-1 bg-muted/40 p-6">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-brand">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {empresa
                ? `${empresa.nombre} · plan ${empresa.plan}`
                : "Operador del SaaS"}
            </p>
          </div>
          <form action={cerrarSesion}>
            <Button variant="outline" type="submit">
              Cerrar sesión
            </Button>
          </form>
        </header>

        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Sesión verificada</CardTitle>
            <CardDescription className="space-y-1">
              <span className="block">
                <strong className="text-foreground">{perfil.nombre}</strong> (
                {email})
              </span>
              <span className="block">
                Rol: {ETIQUETA_ROL[perfil.rol] ?? perfil.rol}
              </span>
              <span className="block">
                Fase 0 completada: autenticación y aislamiento por empresa
                activos. Las tarjetas de asistencia llegan con la Fase 1.
              </span>
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    </div>
  );
}
