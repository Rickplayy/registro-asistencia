-- ============================================================================
-- Migración 0004: Fase 2 — Biometría facial
--
-- * Una sola credencial VIGENTE por empleado y tipo: el re-enrolamiento
--   desactiva la anterior (histórico auditable, nunca se sobreescribe).
-- * Triggers de auditoría sobre credenciales_biometricas: TODA escritura
--   (INSERT/UPDATE/DELETE) queda en `auditoria` a nivel de base de datos,
--   aunque el código de aplicación fallara u omitiera el registro.
--   Las LECTURAS se auditan en la capa de aplicación (Postgres no dispone
--   de triggers SELECT): ver lib/biometria y lib/asistencia/checkin.
-- * En detalles JAMÁS se incluye la plantilla (ni cifrada): solo metadatos.
-- ============================================================================

-- Una credencial vigente por tipo por empleado
create unique index uq_credenciales_vigente
  on public.credenciales_biometricas (empleado_id, tipo)
  where vigente;

-- ----------------------------------------------------------------------------
-- Auditoría automática de escrituras sobre credenciales_biometricas
-- ----------------------------------------------------------------------------
create or replace function app.auditar_credencial_biometrica()
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
    when 'INSERT' then 'biometria.credencial_creada'
    when 'UPDATE' then 'biometria.credencial_actualizada'
    when 'DELETE' then 'biometria.credencial_eliminada'
  end;

  insert into public.auditoria (empresa_id, accion, entidad_afectada, entidad_id, detalles)
  values (
    fila.empresa_id,
    accion,
    'credenciales_biometricas',
    fila.id::text,
    jsonb_build_object(
      'empleado_id', fila.empleado_id,
      'tipo', fila.tipo,
      'vigente', case when tg_op = 'UPDATE' then new.vigente else fila.vigente end,
      'origen', 'trigger_db'
    )
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_auditar_credenciales
  after insert or update or delete on public.credenciales_biometricas
  for each row execute function app.auditar_credencial_biometrica();
