-- ============================================================================
-- Migración 0005: Fase 3 — Huella digital vía WebAuthn
--
-- Con WebAuthn el dato biométrico crudo NUNCA sale del dispositivo del
-- empleado: el sensor (Windows Hello / Touch ID / Android) verifica la huella
-- localmente y el servidor solo recibe una aserción criptográfica. Por eso
-- esta tabla NO guarda plantillas: guarda la clave PÚBLICA de verificación
-- del passkey — un dato criptográfico público, no un dato personal sensible.
--
-- REGLA DE FASE: ninguna tabla nueva sin RLS ni auditoría desde el día uno.
-- ============================================================================

create table public.credenciales_webauthn (
  id             uuid primary key default gen_random_uuid(),
  empleado_id    uuid not null references public.empleados (id) on delete cascade,
  empresa_id     uuid not null references public.empresas (id) on delete restrict,
  -- Identificador del passkey (base64url). Llave de búsqueda del assertion:
  -- se guarda tal cual porque el kiosko debe poder localizarlo con exactitud.
  credential_id  text not null unique,
  -- Clave pública COSE (base64url). Sirve solo para VERIFICAR firmas.
  public_key     text not null,
  -- Contador de firmas del autenticador: detecta clonación de credenciales.
  sign_count     bigint not null default 0,
  transports     text[],
  -- Kiosko donde se enroló (auditoría de origen).
  dispositivo_id uuid references public.dispositivos (id) on delete set null,
  vigente        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.credenciales_webauthn is
  'Passkeys de huella (WebAuthn). Solo clave pública de verificación: el dato biométrico jamás sale del dispositivo del empleado.';

create index idx_webauthn_empleado on public.credenciales_webauthn (empleado_id);
create index idx_webauthn_empresa on public.credenciales_webauthn (empresa_id);

create trigger trg_webauthn_updated_at
  before update on public.credenciales_webauthn
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS: mismas reglas que credenciales_biometricas — solo RH/admin de la MISMA
-- empresa. Los flujos del kiosko pasan por la API con service_role.
-- ----------------------------------------------------------------------------
alter table public.credenciales_webauthn enable row level security;

create policy webauthn_select on public.credenciales_webauthn
  for select to authenticated
  using (
    empresa_id = app.empresa_actual()
    and app.rol_actual() in ('admin_empresa', 'rh')
  );

create policy webauthn_insert on public.credenciales_webauthn
  for insert to authenticated
  with check (
    empresa_id = app.empresa_actual()
    and app.rol_actual() in ('admin_empresa', 'rh')
  );

create policy webauthn_update on public.credenciales_webauthn
  for update to authenticated
  using (
    empresa_id = app.empresa_actual()
    and app.rol_actual() in ('admin_empresa', 'rh')
  )
  with check (empresa_id = app.empresa_actual());

create policy webauthn_delete on public.credenciales_webauthn
  for delete to authenticated
  using (
    empresa_id = app.empresa_actual()
    and app.rol_actual() in ('admin_empresa', 'rh')
  );

-- ----------------------------------------------------------------------------
-- Auditoría automática de escrituras (como credenciales_biometricas en 0004).
-- Las lecturas se auditan en la capa de aplicación.
-- ----------------------------------------------------------------------------
create or replace function app.auditar_credencial_webauthn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fila record;
  accion text;
begin
  fila := coalesce(new, old);
  accion := case tg_op
    when 'INSERT' then 'webauthn.credencial_creada'
    when 'UPDATE' then 'webauthn.credencial_actualizada'
    when 'DELETE' then 'webauthn.credencial_eliminada'
  end;

  insert into public.auditoria (empresa_id, accion, entidad_afectada, entidad_id, detalles)
  values (
    fila.empresa_id,
    accion,
    'credenciales_webauthn',
    fila.id::text,
    jsonb_build_object(
      'empleado_id', fila.empleado_id,
      'vigente', case when tg_op = 'UPDATE' then new.vigente else fila.vigente end,
      'origen', 'trigger_db'
    )
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_auditar_webauthn
  after insert or update or delete on public.credenciales_webauthn
  for each row execute function app.auditar_credencial_webauthn();
