/** Utilidades de sesión para vistas administrativas protegidas. */
import { redirect } from "next/navigation";

import { createClient } from "@/lib/db/server";

export type PerfilAdmin = {
  id: string;
  empresa_id: string | null;
  nombre: string;
  email: string;
  rol: "super_admin" | "admin_empresa" | "rh" | "supervisor";
  activo: boolean;
};

/**
 * Exige un usuario autenticado con perfil administrativo activo.
 * Redirige a /login si no hay sesión o el perfil está inactivo/ausente.
 */
export async function requerirAdmin(): Promise<{
  perfil: PerfilAdmin;
  email: string;
}> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("usuarios_admin")
    .select("id, empresa_id, nombre, email, rol, activo")
    .eq("auth_user_id", user.id)
    .eq("activo", true)
    .maybeSingle<PerfilAdmin>();

  if (!perfil) {
    // Usuario de Auth sin perfil administrativo: fuera.
    await supabase.auth.signOut();
    redirect("/login?error=sin-perfil");
  }

  return { perfil, email: user.email ?? perfil.email };
}
