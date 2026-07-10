-- ============================================================================
-- Migración 0002: Row Level Security (Fase 0 — Cimientos)
--
-- REGLA INQUEBRANTABLE: ninguna tabla sensible sin RLS por empresa_id.
-- RLS se activa en TODAS las tablas desde el primer día. Sin política que lo
-- permita, el acceso es DENEGADO por defecto (el rol `anon` no ve nada).
--
-- Modelo de acceso:
--   * anon               → sin políticas: cero acceso a datos.
--   * authenticated      → solo filas de SU empresa (vía app.empresa_actual()).
--   * super_admin        → acceso global (usuario interno del SaaS).
--   * service_role       → bypass RLS; solo se usa en el backend (API routes),
--                          nunca se expone al cliente.
--
-- Las escrituras del kiosko (check-in) pasan por la API central con
-- service_role + validación de api_key del dispositivo; por eso aquí no hay
-- políticas de escritura para anon.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Esquema privado para funciones auxiliares de RLS
-- (security definer para evitar recursión sobre usuarios_admin)
-- ----------------------------------------------------------------------------
create schema if not exists app;

grant usage on schema app to authenticated;

-- Empresa del usuario autenticado actual (null si no tiene perfil activo)
create or replace function app.empresa_actual()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select empresa_id
  from public.usuarios_admin
  where auth_user_id = (select auth.uid())
    and activo
  limit 1;
$$;

-- ¿El usuario actual es super_admin (operador del SaaS)?
create or replace function app.es_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select rol = 'super_admin'
     from public.usuarios_admin
     where auth_user_id = (select auth.uid())
       and activo
     limit 1),
    false
  );
$$;

-- Rol del usuario actual (para políticas más finas en fases posteriores)
create or replace function app.rol_actual()
returns public.rol_admin
language sql
stable
security definer
set search_path = ''
as $$
  select rol
  from public.usuarios_admin
  where auth_user_id = (select auth.uid())
    and activo
  limit 1;
$$;

revoke execute on function app.empresa_actual() from anon;
revoke execute on function app.es_super_admin() from anon;
revoke execute on function app.rol_actual() from anon;

-- ----------------------------------------------------------------------------
-- Activar RLS en TODAS las tablas
-- ----------------------------------------------------------------------------
alter table public.empresas                  enable row level security;
alter table public.empleados                 enable row level security;
alter table public.credenciales_biometricas  enable row level security;
alter table public.metodos_acceso            enable row level security;
alter table public.registros_asistencia      enable row level security;
alter table public.dispositivos              enable row level security;
alter table public.usuarios_admin            enable row level security;
alter table public.consentimientos           enable row level security;
alter table public.auditoria                 enable row level security;

-- ----------------------------------------------------------------------------
-- empresas: cada admin solo ve SU empresa; nadie la crea/borra desde el cliente
-- ----------------------------------------------------------------------------
create policy empresas_select on public.empresas
  for select to authenticated
  using (id = app.empresa_actual() or app.es_super_admin());

create policy empresas_update on public.empresas
  for update to authenticated
  using (id = app.empresa_actual() and app.rol_actual() = 'admin_empresa')
  with check (id = app.empresa_actual());

-- ----------------------------------------------------------------------------
-- empleados
-- ----------------------------------------------------------------------------
create policy empleados_select on public.empleados
  for select to authenticated
  using (empresa_id = app.empresa_actual() or app.es_super_admin());

create policy empleados_insert on public.empleados
  for insert to authenticated
  with check (
    empresa_id = app.empresa_actual()
    and app.rol_actual() in ('admin_empresa', 'rh')
  );

create policy empleados_update on public.empleados
  for update to authenticated
  using (
    empresa_id = app.empresa_actual()
    and app.rol_actual() in ('admin_empresa', 'rh')
  )
  with check (empresa_id = app.empresa_actual());

create policy empleados_delete on public.empleados
  for delete to authenticated
  using (
    empresa_id = app.empresa_actual()
    and app.rol_actual() = 'admin_empresa'
  );

-- ----------------------------------------------------------------------------
-- credenciales_biometricas: dato sensible — solo lectura/gestión por RH de la
-- misma empresa; la verificación biométrica corre en el backend (service_role)
-- ----------------------------------------------------------------------------
create policy credenciales_select on public.credenciales_biometricas
  for select to authenticated
  using (
    empresa_id = app.empresa_actual()
    and app.rol_actual() in ('admin_empresa', 'rh')
  );

create policy credenciales_insert on public.credenciales_biometricas
  for insert to authenticated
  with check (
    empresa_id = app.empresa_actual()
    and app.rol_actual() in ('admin_empresa', 'rh')
  );

create policy credenciales_update on public.credenciales_biometricas
  for update to authenticated
  using (
    empresa_id = app.empresa_actual()
    and app.rol_actual() in ('admin_empresa', 'rh')
  )
  with check (empresa_id = app.empresa_actual());

create policy credenciales_delete on public.credenciales_biometricas
  for delete to authenticated
  using (
    empresa_id = app.empresa_actual()
    and app.rol_actual() in ('admin_empresa', 'rh')
  );

-- ----------------------------------------------------------------------------
-- metodos_acceso
-- ----------------------------------------------------------------------------
create policy metodos_select on public.metodos_acceso
  for select to authenticated
  using (empresa_id = app.empresa_actual());

create policy metodos_insert on public.metodos_acceso
  for insert to authenticated
  with check (
    empresa_id = app.empresa_actual()
    and app.rol_actual() in ('admin_empresa', 'rh')
  );

create policy metodos_update on public.metodos_acceso
  for update to authenticated
  using (
    empresa_id = app.empresa_actual()
    and app.rol_actual() in ('admin_empresa', 'rh')
  )
  with check (empresa_id = app.empresa_actual());

create policy metodos_delete on public.metodos_acceso
  for delete to authenticated
  using (
    empresa_id = app.empresa_actual()
    and app.rol_actual() in ('admin_empresa', 'rh')
  );

-- ----------------------------------------------------------------------------
-- registros_asistencia: RH consulta; NADIE edita ni borra marcaciones desde el
-- cliente (integridad del registro verificable). El alta la hace la API con
-- service_role tras validar el dispositivo.
-- ----------------------------------------------------------------------------
create policy registros_select on public.registros_asistencia
  for select to authenticated
  using (empresa_id = app.empresa_actual() or app.es_super_admin());

-- ----------------------------------------------------------------------------
-- dispositivos
-- ----------------------------------------------------------------------------
create policy dispositivos_select on public.dispositivos
  for select to authenticated
  using (empresa_id = app.empresa_actual());

create policy dispositivos_insert on public.dispositivos
  for insert to authenticated
  with check (
    empresa_id = app.empresa_actual()
    and app.rol_actual() = 'admin_empresa'
  );

create policy dispositivos_update on public.dispositivos
  for update to authenticated
  using (
    empresa_id = app.empresa_actual()
    and app.rol_actual() = 'admin_empresa'
  )
  with check (empresa_id = app.empresa_actual());

create policy dispositivos_delete on public.dispositivos
  for delete to authenticated
  using (
    empresa_id = app.empresa_actual()
    and app.rol_actual() = 'admin_empresa'
  );

-- ----------------------------------------------------------------------------
-- usuarios_admin: cada quien ve su propia fila y las de su empresa.
-- Altas/cambios de rol SOLO vía backend (service_role) para evitar
-- auto-escalamiento de privilegios desde el cliente.
-- ----------------------------------------------------------------------------
create policy usuarios_admin_select on public.usuarios_admin
  for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    or empresa_id = app.empresa_actual()
    or app.es_super_admin()
  );

-- ----------------------------------------------------------------------------
-- consentimientos: evidencia legal — se crea, jamás se edita ni se borra desde
-- el cliente (la revocación ARCO inserta un nuevo evento vía backend).
-- ----------------------------------------------------------------------------
create policy consentimientos_select on public.consentimientos
  for select to authenticated
  using (empresa_id = app.empresa_actual());

create policy consentimientos_insert on public.consentimientos
  for insert to authenticated
  with check (
    empresa_id = app.empresa_actual()
    and app.rol_actual() in ('admin_empresa', 'rh')
  );

-- ----------------------------------------------------------------------------
-- auditoria: bitácora inmutable — INSERT de la propia empresa, SELECT de la
-- propia empresa; sin UPDATE ni DELETE para nadie salvo service_role.
-- ----------------------------------------------------------------------------
create policy auditoria_select on public.auditoria
  for select to authenticated
  using (empresa_id = app.empresa_actual() or app.es_super_admin());

create policy auditoria_insert on public.auditoria
  for insert to authenticated
  with check (empresa_id = app.empresa_actual());
