-- ============================================================================
-- Migración 0006: Fase 5 — Escalamiento (planes, facturación, white-label,
-- retención ARCO).
--
-- * Planes: la tabla empresas ya tenía `plan` (texto); se normaliza a los
--   tres planes comerciales. Los LÍMITES de cada plan viven en lib/planes.ts
--   (código): cambiarlos no requiere migración.
-- * suscripciones: estado de cobro por empresa. Los clientes NUNCA escriben
--   aquí — todo cambio pasa por el backend (webhook del proveedor de pagos o
--   confirmación del proveedor simulado). Jamás se guardan datos de tarjeta:
--   el proveedor certificado (Stripe Checkout) los maneja en su dominio.
-- * White-label: logo y color de marca por empresa (kiosko y panel).
-- * ARCO: fecha_baja para computar el periodo de retención antes de la purga.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Planes comerciales
-- ----------------------------------------------------------------------------
update public.empresas set plan = 'basico' where plan not in ('basico', 'pro', 'enterprise');

alter table public.empresas
  alter column plan set default 'basico',
  add constraint chk_plan_valido check (plan in ('basico', 'pro', 'enterprise'));

-- ----------------------------------------------------------------------------
-- White-label (logo como data-URL acotado; color de marca hex)
-- ----------------------------------------------------------------------------
alter table public.empresas
  add column logo_data_url text
    constraint chk_logo_tamano check (logo_data_url is null or length(logo_data_url) <= 200000),
  add column color_marca text
    constraint chk_color_hex check (color_marca is null or color_marca ~ '^#[0-9a-fA-F]{6}$');

comment on column public.empresas.logo_data_url is
  'Logo white-label como data URL (png/jpeg/svg, máx ~150KB). Se muestra en kiosko y panel.';

-- ----------------------------------------------------------------------------
-- Retención ARCO
-- ----------------------------------------------------------------------------
alter table public.empleados add column fecha_baja date;

comment on column public.empleados.fecha_baja is
  'Fecha de baja: inicia el periodo de retención antes de poder purgar datos personales (ARCO).';

-- ----------------------------------------------------------------------------
-- suscripciones (una por empresa)
-- ----------------------------------------------------------------------------
create table public.suscripciones (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null unique references public.empresas (id) on delete restrict,
  plan                text not null check (plan in ('basico', 'pro', 'enterprise')),
  estado              text not null default 'pendiente_pago'
    check (estado in ('activa', 'pendiente_pago', 'cancelada')),
  proveedor           text not null default 'simulado'
    check (proveedor in ('simulado', 'stripe')),
  -- Referencia de la suscripción EN el proveedor (nunca datos de pago aquí).
  referencia_externa  text,
  periodo_fin         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.suscripciones is
  'Estado de cobro por empresa. Solo referencia del proveedor de pagos certificado; JAMÁS datos de tarjeta.';

create trigger trg_suscripciones_updated_at
  before update on public.suscripciones
  for each row execute function public.set_updated_at();

alter table public.suscripciones enable row level security;

-- El admin de la empresa VE su suscripción; nadie la escribe desde el cliente
-- (activaciones/cambios pasan por el backend con service_role).
create policy suscripciones_select on public.suscripciones
  for select to authenticated
  using (empresa_id = app.empresa_actual() or app.es_super_admin());
