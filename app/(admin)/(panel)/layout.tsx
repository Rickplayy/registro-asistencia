import { cerrarSesion } from "@/lib/auth/actions";
import { requerirAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { Sidebar } from "@/components/panel/sidebar";
import { Button } from "@/components/ui/button";

const ETIQUETA_ROL: Record<string, string> = {
  super_admin: "Super administrador",
  admin_empresa: "Administrador",
  rh: "Recursos Humanos",
  supervisor: "Supervisor",
};

/** Marco de todas las vistas administrativas: sidebar + encabezado con sesión. */
export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { perfil } = await requerirAdmin();

  const supabase = await createClient();
  const { data: empresa } = perfil.empresa_id
    ? await supabase
        .from("empresas")
        .select("nombre")
        .eq("id", perfil.empresa_id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="flex min-h-screen">
      <Sidebar empresaNombre={empresa?.nombre ?? "Operador del SaaS"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-background px-6 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{perfil.nombre}</p>
            <p className="truncate text-xs text-muted-foreground">
              {ETIQUETA_ROL[perfil.rol] ?? perfil.rol}
            </p>
          </div>
          <form action={cerrarSesion}>
            <Button variant="outline" size="sm" type="submit">
              Cerrar sesión
            </Button>
          </form>
        </header>
        <main className="flex-1 bg-muted/40 p-6">{children}</main>
      </div>
    </div>
  );
}
