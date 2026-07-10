-- ============================================================================
-- Migración 0001: Esquema inicial (Fase 0 — Cimientos)
-- Tablas núcleo según sección 10.1 del Documento Maestro.
--
-- Convenciones:
--   * Toda tabla de negocio lleva empresa_id para aplicar Row Level Security
--     por tenant de forma consistente (sección 10.2 del documento maestro).
--   * Los campos marcados *_cifrado / *_cifrada guardan el payload cifrado con
--     AES-256-GCM por la capa de aplicación (lib/crypto). Formato:
--     v1:<iv_base64>:<tag_base64>:<ciphertext_base64>. La llave vive en un
--     gestor de secretos (Supabase Vault / variables de entorno), nunca aquí.
--   * Nunca se guarda imagen facial ni huella cruda: solo plantilla cifrada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tipos enumerados
-- ----------------------------------------------------------------------------
create type public.rol_admin as enum ('super_admin', 'admin_empresa', 'rh', 'supervisor');
create type public.estatus_empleado as enum ('activo', 'inactivo', 'baja');
create type public.tipo_credencial_biometrica as enum ('facial', 'huella');
create type public.tipo_metodo_acceso as enum ('pin', 'qr');
create type public.metodo_registro as enum ('facial', 'huella', 'pin', 'qr');
create type public.tipo_registro_asistencia as enum ('entrada', 'salida');
create type public.tipo_dispositivo as enum ('kiosko', 'movil', 'lector_fisico');
create type public.tipo_dato_consentimiento as enum ('biometrico_facial', 'biometrico_huella', 'datos_personales');

-- ----------------------------------------------------------------------------
-- Función auxiliar: mantener updated_at
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- empresas (tenant raíz)
-- ----------------------------------------------------------------------------
create table public.empresas (
  id                          uuid primary key default gen_random_uuid(),
  nombre                      text not null,
  rfc_empresa                 text,
  plan                        text not null default 'mvp',
  config_metodos_habilitados  jsonb not null default '["pin", "qr"]'::jsonb,
  activa                      boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.empresas is 'Tenant raíz: una fila por empresa cliente. Todo el aislamiento multi-tenant cuelga de esta tabla.';

create trigger trg_empresas_updated_at
  before update on public.empresas
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- empleados
-- ----------------------------------------------------------------------------
create table public.empleados (
  id                        uuid primary key default gen_random_uuid(),
  empresa_id                uuid not null references public.empresas (id) on delete restrict,
  nombre                    text not null,
  puesto                    text,
  numero_empleado           text,
  curp_cifrado              text,        -- cifrado AES-256-GCM (lib/crypto)
  rfc_cifrado               text,        -- cifrado AES-256-GCM (lib/crypto)
  fecha_nacimiento_cifrada  text,        -- cifrado AES-256-GCM (lib/crypto)
  sexo                      text,
  estatus                   public.estatus_empleado not null default 'activo',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (empresa_id, numero_empleado)
);

comment on table public.empleados is 'Empleados por empresa. CURP, RFC y fecha de nacimiento van cifrados a nivel de columna (LFPDPPP).';

create index idx_empleados_empresa on public.empleados (empresa_id);

create trigger trg_empleados_updated_at
  before update on public.empleados
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- credenciales_biometricas
-- Aislada de empleados para que una consulta rutinaria de RH nunca pase
-- innecesariamente cerca de datos sensibles (sección 10.2).
-- ----------------------------------------------------------------------------
create table public.credenciales_biometricas (
  id                 uuid primary key default gen_random_uuid(),
  empleado_id        uuid not null references public.empleados (id) on delete cascade,
  empresa_id         uuid not null references public.empresas (id) on delete restrict,
  tipo               public.tipo_credencial_biometrica not null,
  plantilla_cifrada  text not null,  -- SOLO plantilla matemática cifrada; nunca imagen/huella cruda
  vigente            boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.credenciales_biometricas is 'Plantillas biométricas cifradas. Prohibido guardar la imagen o huella cruda.';

create index idx_credenciales_empleado on public.credenciales_biometricas (empleado_id);
create index idx_credenciales_empresa on public.credenciales_biometricas (empresa_id);

create trigger trg_credenciales_updated_at
  before update on public.credenciales_biometricas
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- metodos_acceso (PIN / QR)
-- ----------------------------------------------------------------------------
create table public.metodos_acceso (
  id                  uuid primary key default gen_random_uuid(),
  empleado_id         uuid not null references public.empleados (id) on delete cascade,
  empresa_id          uuid not null references public.empresas (id) on delete restrict,
  tipo                public.tipo_metodo_acceso not null,
  valor_hash_o_token  text not null,  -- PIN: hash (nunca en claro); QR: token rotativo
  activo              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.metodos_acceso is 'PIN con hash; QR con token rotativo. Nunca se guarda el PIN en claro.';

create index idx_metodos_acceso_empleado on public.metodos_acceso (empleado_id);
create index idx_metodos_acceso_empresa on public.metodos_acceso (empresa_id);

create trigger trg_metodos_acceso_updated_at
  before update on public.metodos_acceso
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- dispositivos
-- ----------------------------------------------------------------------------
create table public.dispositivos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas (id) on delete restrict,
  tipo          public.tipo_dispositivo not null default 'kiosko',
  nombre        text,
  ubicacion     text,
  api_key_hash  text,  -- hash SHA-256 de la API key; la key en claro solo se muestra una vez al crearla
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.dispositivos is 'Identifica el origen de cada marcación. La API key se guarda como hash, nunca en claro.';

create index idx_dispositivos_empresa on public.dispositivos (empresa_id);

create trigger trg_dispositivos_updated_at
  before update on public.dispositivos
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- registros_asistencia (tabla de mayor volumen)
-- ----------------------------------------------------------------------------
create table public.registros_asistencia (
  id             uuid primary key default gen_random_uuid(),
  empleado_id    uuid not null references public.empleados (id) on delete restrict,
  empresa_id     uuid not null references public.empresas (id) on delete restrict,
  metodo         public.metodo_registro not null,
  tipo           public.tipo_registro_asistencia not null default 'entrada',
  fecha          date not null default (now() at time zone 'America/Mexico_City')::date,
  hora           time not null default (now() at time zone 'America/Mexico_City')::time,
  registrado_en  timestamptz not null default now(),  -- marca de tiempo absoluta, no editable
  dispositivo_id uuid references public.dispositivos (id) on delete set null,
  created_at     timestamptz not null default now()
);

comment on table public.registros_asistencia is 'Evento de check-in/check-out. Registro electrónico verificable exigido por la reforma laboral 2027.';

create index idx_registros_empresa_fecha on public.registros_asistencia (empresa_id, fecha);
create index idx_registros_empleado_fecha on public.registros_asistencia (empleado_id, fecha);

-- ----------------------------------------------------------------------------
-- usuarios_admin (vinculados a Supabase Auth)
-- ----------------------------------------------------------------------------
create table public.usuarios_admin (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users (id) on delete cascade,
  empresa_id    uuid references public.empresas (id) on delete restrict,  -- null solo para super_admin
  nombre        text not null,
  email         text not null,
  rol           public.rol_admin not null default 'rh',
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint chk_empresa_por_rol check (rol = 'super_admin' or empresa_id is not null)
);

comment on table public.usuarios_admin is 'Perfiles administrativos ligados a auth.users. El rol y la empresa determinan el alcance vía RLS.';

create index idx_usuarios_admin_empresa on public.usuarios_admin (empresa_id);

create trigger trg_usuarios_admin_updated_at
  before update on public.usuarios_admin
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- consentimientos (evidencia legal LFPDPPP)
-- ----------------------------------------------------------------------------
create table public.consentimientos (
  id                        uuid primary key default gen_random_uuid(),
  empleado_id               uuid not null references public.empleados (id) on delete restrict,
  empresa_id                uuid not null references public.empresas (id) on delete restrict,
  tipo_dato                 public.tipo_dato_consentimiento not null,
  version_aviso_privacidad  text not null,
  fecha                     timestamptz not null default now(),
  ip                        inet,
  otorgado                  boolean not null default true,
  revocado_en               timestamptz,
  created_at                timestamptz not null default now()
);

comment on table public.consentimientos is 'Evidencia del consentimiento expreso (LFPDPPP). Sin consentimiento vigente no se procesa biometría.';

create index idx_consentimientos_empleado on public.consentimientos (empleado_id);
create index idx_consentimientos_empresa on public.consentimientos (empresa_id);

-- ----------------------------------------------------------------------------
-- auditoria (trazabilidad de accesos; solo inserción, nunca edición)
-- ----------------------------------------------------------------------------
create table public.auditoria (
  id                 bigint generated always as identity primary key,
  usuario_admin_id   uuid references public.usuarios_admin (id) on delete set null,
  empresa_id         uuid references public.empresas (id) on delete set null,
  accion             text not null,
  entidad_afectada   text not null,
  entidad_id         text,
  detalles           jsonb,
  fecha              timestamptz not null default now()
);

comment on table public.auditoria is 'Bitácora inmutable de acceso a datos sensibles, cambios salariales y aprobaciones. Solo INSERT.';

create index idx_auditoria_empresa_fecha on public.auditoria (empresa_id, fecha);
