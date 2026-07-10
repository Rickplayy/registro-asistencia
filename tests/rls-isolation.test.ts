/**
 * Prueba de aislamiento multi-tenant (Row Level Security).
 *
 * REGLA DEL PROYECTO: no se avanza a la Fase 1 sin que esta prueba pase.
 *
 * Corre contra un proyecto Supabase real con las migraciones aplicadas:
 *   npm run test:rls
 *
 * Requiere en .env.local (o el entorno):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY (solo para sembrar/limpiar datos de prueba).
 *
 * Escenario: dos empresas (A y B), un admin y un empleado en cada una.
 * Se verifica que el admin de A no pueda leer, insertar ni actualizar datos
 * de B por ningún camino, y que el rol anon no vea absolutamente nada.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const configurado = Boolean(URL && ANON_KEY && SERVICE_KEY);

if (!configurado) {
  console.warn(
    "\n[test:rls] OMITIDO: faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY en .env.local.\n" +
      "Esta prueba DEBE pasar contra el proyecto Supabase real antes de avanzar a la Fase 1.\n",
  );
}

type Tenant = {
  empresaId: string;
  empleadoId: string;
  adminAuthId: string;
  adminEmail: string;
  cliente: SupabaseClient; // sesión iniciada como admin de esta empresa
};

const PASSWORD = `Prueba-${randomBytes(12).toString("hex")}!`;

describe.runIf(configurado)("Aislamiento multi-tenant (RLS)", () => {
  let service: SupabaseClient;
  let tenantA: Tenant;
  let tenantB: Tenant;

  async function crearTenant(nombre: string): Promise<Tenant> {
    const sufijo = randomUUID().slice(0, 8);
    const adminEmail = `rls-test-${nombre}-${sufijo}@example.com`;

    const { data: empresa, error: errEmpresa } = await service
      .from("empresas")
      .insert({ nombre: `RLS Test ${nombre} ${sufijo}` })
      .select("id")
      .single();
    if (errEmpresa) throw errEmpresa;

    const { data: authUser, error: errAuth } =
      await service.auth.admin.createUser({
        email: adminEmail,
        password: PASSWORD,
        email_confirm: true,
      });
    if (errAuth) throw errAuth;

    const { error: errPerfil } = await service.from("usuarios_admin").insert({
      auth_user_id: authUser.user.id,
      empresa_id: empresa.id,
      nombre: `Admin ${nombre}`,
      email: adminEmail,
      rol: "admin_empresa",
    });
    if (errPerfil) throw errPerfil;

    const { data: empleado, error: errEmpleado } = await service
      .from("empleados")
      .insert({
        empresa_id: empresa.id,
        nombre: `Empleado ${nombre}`,
        puesto: "Prueba",
      })
      .select("id")
      .single();
    if (errEmpleado) throw errEmpleado;

    const cliente = createClient(URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: errLogin } = await cliente.auth.signInWithPassword({
      email: adminEmail,
      password: PASSWORD,
    });
    if (errLogin) throw errLogin;

    return {
      empresaId: empresa.id,
      empleadoId: empleado.id,
      adminAuthId: authUser.user.id,
      adminEmail,
      cliente,
    };
  }

  beforeAll(async () => {
    service = createClient(URL!, SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    tenantA = await crearTenant("A");
    tenantB = await crearTenant("B");
  }, 60_000);

  afterAll(async () => {
    // Limpieza en orden inverso a las FKs
    for (const t of [tenantA, tenantB].filter(Boolean)) {
      await service.from("empleados").delete().eq("empresa_id", t.empresaId);
      await service
        .from("usuarios_admin")
        .delete()
        .eq("empresa_id", t.empresaId);
      await service.from("empresas").delete().eq("id", t.empresaId);
      await service.auth.admin.deleteUser(t.adminAuthId);
    }
  }, 60_000);

  it("cada admin ve únicamente su propia empresa", async () => {
    const { data, error } = await tenantA.cliente.from("empresas").select("id");
    expect(error).toBeNull();
    const ids = (data ?? []).map((e) => e.id);
    expect(ids).toContain(tenantA.empresaId);
    expect(ids).not.toContain(tenantB.empresaId);
  });

  it("admin A no ve empleados de la empresa B (ni en listado ni por id)", async () => {
    const { data: listado } = await tenantA.cliente
      .from("empleados")
      .select("id, empresa_id");
    expect(listado ?? []).not.toHaveLength(0);
    expect(
      (listado ?? []).every((e) => e.empresa_id === tenantA.empresaId),
    ).toBe(true);

    // Acceso directo por id conocido de otro tenant → RLS devuelve vacío
    const { data: directo } = await tenantA.cliente
      .from("empleados")
      .select("id")
      .eq("id", tenantB.empleadoId);
    expect(directo).toEqual([]);
  });

  it("admin A no puede insertar empleados en la empresa B", async () => {
    const { error } = await tenantA.cliente.from("empleados").insert({
      empresa_id: tenantB.empresaId,
      nombre: "Intruso",
    });
    expect(error).not.toBeNull(); // violación de política RLS
  });

  it("admin A no puede modificar ni borrar empleados de la empresa B", async () => {
    const { data: actualizados } = await tenantA.cliente
      .from("empleados")
      .update({ nombre: "Hackeado" })
      .eq("id", tenantB.empleadoId)
      .select("id");
    expect(actualizados).toEqual([]); // 0 filas afectadas

    const { data: borrados } = await tenantA.cliente
      .from("empleados")
      .delete()
      .eq("id", tenantB.empleadoId)
      .select("id");
    expect(borrados).toEqual([]);

    // El empleado de B sigue intacto
    const { data: intacto } = await service
      .from("empleados")
      .select("nombre")
      .eq("id", tenantB.empleadoId)
      .single();
    expect(intacto?.nombre).toBe("Empleado B");
  });

  it("admin A no ve usuarios_admin, registros ni consentimientos de B", async () => {
    const { data: admins } = await tenantA.cliente
      .from("usuarios_admin")
      .select("empresa_id");
    expect(
      (admins ?? []).every((u) => u.empresa_id === tenantA.empresaId),
    ).toBe(true);

    for (const tabla of [
      "registros_asistencia",
      "consentimientos",
      "credenciales_biometricas",
      "metodos_acceso",
      "dispositivos",
      "auditoria",
    ]) {
      const { data, error } = await tenantA.cliente
        .from(tabla)
        .select("empresa_id")
        .eq("empresa_id", tenantB.empresaId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it("el rol anon (sin sesión) no ve absolutamente nada", async () => {
    const anon = createClient(URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    for (const tabla of [
      "empresas",
      "empleados",
      "credenciales_biometricas",
      "metodos_acceso",
      "registros_asistencia",
      "dispositivos",
      "usuarios_admin",
      "consentimientos",
      "auditoria",
    ]) {
      const { data } = await anon.from(tabla).select("*").limit(5);
      expect(data ?? []).toEqual([]);
    }
  });

  it("anon tampoco puede insertar en tablas sensibles", async () => {
    const anon = createClient(URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await anon.from("registros_asistencia").insert({
      empleado_id: tenantA.empleadoId,
      empresa_id: tenantA.empresaId,
      metodo: "pin",
      tipo: "entrada",
    });
    expect(error).not.toBeNull();
  });
});

describe.runIf(!configurado)("Aislamiento multi-tenant (RLS)", () => {
  it.skip("requiere credenciales de Supabase en .env.local — ver docs/SETUP.md", () => {});
});
