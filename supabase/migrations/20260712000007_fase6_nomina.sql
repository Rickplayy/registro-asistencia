-- ============================================================================
-- Migración 0007: Fase 6 — Incidencias y proyección de nómina (sección 10.2).
--
-- Este módulo CALCULA Y PROYECTA: no timbra CFDI ni calcula ISR/IMSS
-- (sección 11.1). Reglas de la LFT (sección 2.3) que la base refuerza:
--   * tope_descuento_pct jamás mayor a 30 (CHECK, además del backend).
--   * salarios es HISTÓRICO: nunca se sobreescribe un monto — un cambio
--     cierra la vigencia anterior e inserta fila nueva (auditable ante STPS).
--
-- REGLA DE FASE 5 vigente: ninguna tabla nueva sin RLS (y con su entrada en
-- la matriz de aislamiento de tests/rls-isolation.test.ts).
-- ============================================================================

create type public.tipo_salario as enum ('hora', 'dia');
create type public.tipo_bono as enum ('fijo', 'porcentaje', 'condicional');

-- ----------------------------------------------------------------------------
-- salarios (histórico, nunca se sobrescribe)
-- ----------------------------------------------------------------------------
create table public.salarios (
  id             uuid primary key default gen_random_uuid(),
  empleado_id    uuid not null references public.empleados (id) on delete restrict,
  empresa_id     uuid not null references public.empresas (id) on delete restrict,
  tipo           public.tipo_salario not null,
  monto          numeric(10,2) not null check (monto > 0),
  vigente_desde  date not null,
  vigente_hasta  date,  -- null = vigente hoy
  created_at     timestamptz not null default now()
);

comment on table public.salarios is
  'Histórico salarial: ante una auditoría se reconstruye cuánto ganaba un empleado en cualquier fecha (sección 10.2). Solo INSERT + cierre de vigencia.';

create index idx_salarios_empleado on public.salarios (empleado_id, vigente_desde desc);
create index idx_salarios_empresa on public.salarios (empresa_id);

-- ----------------------------------------------------------------------------
-- configuracion_nomina (una fila por empresa)
-- ----------------------------------------------------------------------------
create table public.configuracion_nomina (
  id                        uuid primary key default gen_random_uuid(),
  empresa_id                uuid not null unique references public.empresas (id) on delete restrict,
  -- Tope de descuento: la empresa puede fijar IGUAL O MENOR al 30% legal,
  -- jamás mayor (Art. 110 LFT — CHECK en base + validación en backend).
  tope_descuento_pct        numeric(4,1) not null default 30 check (tope_descuento_pct >= 0 and tope_descuento_pct <= 30),
  minutos_tolerancia        integer not null default 15 check (minutos_tolerancia >= 0),
  -- 0 = los retardos no se acumulan a falta (según reglamento interior)
  retardos_antes_de_falta   integer not null default 0 check (retardos_antes_de_falta >= 0),
  faltas_alerta_30d         integer not null default 3 check (faltas_alerta_30d >= 1),
  aplica_prima_dominical    boolean not null default false,
  -- Salario mínimo general diario vigente (CONASAMI). Se captura por empresa
  -- para poder ajustarlo cada año sin migración; default 2026.
  salario_minimo_diario     numeric(8,2) not null default 315.04 check (salario_minimo_diario > 0),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

comment on table public.configuracion_nomina is
  'Política de nómina por empresa dentro del margen legal (sección 11.2). El sistema impide configurar algo que viole la LFT.';

create trigger trg_config_nomina_updated_at
  before update on public.configuracion_nomina
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- bonos (catálogo por empresa)
-- ----------------------------------------------------------------------------
create table public.bonos (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresas (id) on delete restrict,
  nombre               text not null,
  tipo                 public.tipo_bono not null,
  monto_o_pct          numeric(10,2) not null check (monto_o_pct > 0),
  -- Para tipo 'condicional': sin_faltas | sin_retardos | asistencia_perfecta
  condicion            text check (condicion in ('sin_faltas', 'sin_retardos', 'asistencia_perfecta')),
  requiere_aprobacion  boolean not null default false,
  activo               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger trg_bonos_updated_at
  before update on public.bonos
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- bonos_aprobaciones (quién aprobó qué bono, para qué empleado y periodo)
-- ----------------------------------------------------------------------------
create table public.bonos_aprobaciones (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete restrict,
  bono_id        uuid not null references public.bonos (id) on delete cascade,
  empleado_id    uuid not null references public.empleados (id) on delete cascade,
  periodo_desde  date not null,
  periodo_hasta  date not null,
  aprobado_por   uuid references public.usuarios_admin (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (bono_id, empleado_id, periodo_desde, periodo_hasta)
);

comment on table public.bonos_aprobaciones is
  'Aprobación humana de bonos con requiere_aprobacion (sección 11.2): queda quién aprobó qué, también en auditoria.';

-- ----------------------------------------------------------------------------
-- incidencias (agregado por empleado y periodo; alimenta la exportación)
-- ----------------------------------------------------------------------------
create table public.incidencias (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresas (id) on delete restrict,
  empleado_id          uuid not null references public.empleados (id) on delete restrict,
  periodo_desde        date not null,
  periodo_hasta        date not null,
  horas_trabajadas     numeric(7,2) not null default 0,
  horas_extra_dobles   numeric(7,2) not null default 0,
  horas_extra_triples  numeric(7,2) not null default 0,
  retardos             integer not null default 0,
  faltas               integer not null default 0,
  descuento_calculado  numeric(10,2) not null default 0,
  bonos_aplicados      numeric(10,2) not null default 0,
  total_proyectado     numeric(10,2) not null default 0,
  generado_por         uuid references public.usuarios_admin (id) on delete set null,
  created_at           timestamptz not null default now(),
  unique (empleado_id, periodo_desde, periodo_hasta)
);

comment on table public.incidencias is
  'Proyección calculada por periodo (sección 10.2). Se materializa al EXPORTAR, tras revisión humana en la vista 8.6. No es un pago: es el insumo del sistema de nómina del cliente.';

create index idx_incidencias_empresa_periodo on public.incidencias (empresa_id, periodo_desde);

-- ----------------------------------------------------------------------------
-- RLS de TODAS las tablas nuevas (regla inquebrantable)
-- ----------------------------------------------------------------------------
alter table public.salarios enable row level security;
alter table public.configuracion_nomina enable row level security;
alter table public.bonos enable row level security;
alter table public.bonos_aprobaciones enable row level security;
alter table public.incidencias enable row level security;

-- salarios: dato sensible (sección 6) — solo RH/admin de la MISMA empresa.
-- Sin UPDATE ni DELETE desde el cliente: el histórico no se toca (el cierre
-- de vigencia pasa por UPDATE de vigente_hasta... que también es histórico).
create policy salarios_select on public.salarios
  for select to authenticated
  using (empresa_id = app.empresa_actual() and app.rol_actual() in ('admin_empresa', 'rh'));
create policy salarios_insert on public.salarios
  for insert to authenticated
  with check (empresa_id = app.empresa_actual() and app.rol_actual() in ('admin_empresa', 'rh'));
create policy salarios_update on public.salarios
  for update to authenticated
  using (empresa_id = app.empresa_actual() and app.rol_actual() in ('admin_empresa', 'rh'))
  with check (empresa_id = app.empresa_actual());

-- configuracion_nomina
create policy config_nomina_select on public.configuracion_nomina
  for select to authenticated
  using (empresa_id = app.empresa_actual());
create policy config_nomina_insert on public.configuracion_nomina
  for insert to authenticated
  with check (empresa_id = app.empresa_actual() and app.rol_actual() = 'admin_empresa');
create policy config_nomina_update on public.configuracion_nomina
  for update to authenticated
  using (empresa_id = app.empresa_actual() and app.rol_actual() = 'admin_empresa')
  with check (empresa_id = app.empresa_actual());

-- bonos
create policy bonos_select on public.bonos
  for select to authenticated
  using (empresa_id = app.empresa_actual());
create policy bonos_insert on public.bonos
  for insert to authenticated
  with check (empresa_id = app.empresa_actual() and app.rol_actual() = 'admin_empresa');
create policy bonos_update on public.bonos
  for update to authenticated
  using (empresa_id = app.empresa_actual() and app.rol_actual() = 'admin_empresa')
  with check (empresa_id = app.empresa_actual());

-- bonos_aprobaciones: INSERT-only (evidencia de la aprobación humana)
create policy bonos_aprob_select on public.bonos_aprobaciones
  for select to authenticated
  using (empresa_id = app.empresa_actual());
create policy bonos_aprob_insert on public.bonos_aprobaciones
  for insert to authenticated
  with check (empresa_id = app.empresa_actual() and app.rol_actual() = 'admin_empresa');

-- incidencias: lectura + inserción (materialización al exportar); sin edición
-- desde el cliente — un recálculo inserta el periodo de nuevo vía upsert backend.
create policy incidencias_select on public.incidencias
  for select to authenticated
  using (empresa_id = app.empresa_actual());
create policy incidencias_insert on public.incidencias
  for insert to authenticated
  with check (empresa_id = app.empresa_actual() and app.rol_actual() in ('admin_empresa', 'rh'));
create policy incidencias_update on public.incidencias
  for update to authenticated
  using (empresa_id = app.empresa_actual() and app.rol_actual() in ('admin_empresa', 'rh'))
  with check (empresa_id = app.empresa_actual());
