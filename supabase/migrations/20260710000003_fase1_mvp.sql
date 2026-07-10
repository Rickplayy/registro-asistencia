-- ============================================================================
-- Migración 0003: Fase 1 — MVP (PIN + QR + dashboard)
--
-- * empleados.fecha_ingreso: exigido por el alcance de la Fase 1 (sección 10.1).
-- * empresas.hora_entrada / hora_salida / tolerancia_retardo_minutos: jornada
--   de referencia para calcular retardos y faltas en dashboard y reportes.
--   (La configuración fina por reglamento interior llega en Fase 6 con
--   configuracion_nomina; esto es el mínimo para el MVP.)
-- * Índices de metodos_acceso para la búsqueda del kiosko:
--   - PIN: el hash es determinista (HMAC con llave del servidor), por lo que
--     la unicidad del hash dentro de la empresa equivale a unicidad del PIN.
--   - Un solo método ACTIVO por tipo por empleado.
-- ============================================================================

alter table public.empleados
  add column fecha_ingreso date;

alter table public.empresas
  add column hora_entrada time not null default '09:00',
  add column hora_salida  time not null default '18:00',
  add column tolerancia_retardo_minutos integer not null default 15
    constraint chk_tolerancia_no_negativa check (tolerancia_retardo_minutos >= 0);

comment on column public.empresas.hora_entrada is 'Hora de entrada de referencia para marcar retardos en dashboard/reportes (MVP).';
comment on column public.empresas.tolerancia_retardo_minutos is 'Minutos de gracia tras hora_entrada antes de contar retardo.';

-- Un método activo por tipo por empleado (histórico se conserva desactivado)
create unique index uq_metodos_acceso_activo
  on public.metodos_acceso (empleado_id, tipo)
  where activo;

-- Búsqueda del kiosko por hash de PIN dentro de la empresa + unicidad del PIN
create unique index uq_metodos_acceso_valor_empresa
  on public.metodos_acceso (empresa_id, tipo, valor_hash_o_token)
  where activo;
