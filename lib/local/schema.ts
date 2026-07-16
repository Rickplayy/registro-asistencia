/**
 * Esquema SQLite del modo local — traducción fiel de supabase/migrations/*.
 *
 * Diferencias con Postgres (documentadas, no accidentales):
 *  - uuid → TEXT (lo genera lib/local/client con crypto.randomUUID()).
 *  - enum → TEXT + CHECK con los mismos valores.
 *  - jsonb → TEXT con JSON serializado (lib/local/client lo parsea al leer).
 *  - boolean → INTEGER 0/1 (lib/local/client lo convierte a true/false).
 *  - timestamptz → TEXT ISO-8601 UTC.
 *  - auth.users → tabla local auth_users (ver lib/local/auth.ts). NO es
 *    accesible vía from(): solo el módulo de autenticación la toca.
 *
 * Las reglas RLS de 20260709000002_rls_policies.sql se emulan en
 * lib/local/client.ts (POLITICAS), no aquí: SQLite no tiene roles ni RLS.
 */

const AHORA = `(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const DDL = `
create table if not exists auth_users (
  id             text primary key,
  email          text not null unique collate nocase,
  password_hash  text not null,
  created_at     text not null default ${AHORA},
  updated_at     text not null default ${AHORA}
);

create table if not exists empresas (
  id                          text primary key,
  nombre                      text not null,
  rfc_empresa                 text,
  plan                        text not null default 'mvp',
  config_metodos_habilitados  text not null default '["pin","qr"]',
  activa                      integer not null default 1,
  hora_entrada                text not null default '09:00:00',
  hora_salida                 text not null default '18:00:00',
  tolerancia_retardo_minutos  integer not null default 15
    constraint chk_tolerancia_no_negativa check (tolerancia_retardo_minutos >= 0),
  created_at                  text not null default ${AHORA},
  updated_at                  text not null default ${AHORA}
);

create table if not exists empleados (
  id                        text primary key,
  empresa_id                text not null references empresas (id) on delete restrict,
  nombre                    text not null,
  puesto                    text,
  numero_empleado           text,
  curp_cifrado              text,
  rfc_cifrado               text,
  fecha_nacimiento_cifrada  text,
  sexo                      text,
  estatus                   text not null default 'activo'
    check (estatus in ('activo','inactivo','baja')),
  fecha_ingreso             text,
  created_at                text not null default ${AHORA},
  updated_at                text not null default ${AHORA},
  unique (empresa_id, numero_empleado)
);
create index if not exists idx_empleados_empresa on empleados (empresa_id);

create table if not exists credenciales_biometricas (
  id                 text primary key,
  empleado_id        text not null references empleados (id) on delete cascade,
  empresa_id         text not null references empresas (id) on delete restrict,
  tipo               text not null check (tipo in ('facial','huella')),
  plantilla_cifrada  text not null,
  vigente            integer not null default 1,
  created_at         text not null default ${AHORA},
  updated_at         text not null default ${AHORA}
);
create index if not exists idx_credenciales_empleado on credenciales_biometricas (empleado_id);
create index if not exists idx_credenciales_empresa on credenciales_biometricas (empresa_id);

create table if not exists metodos_acceso (
  id                  text primary key,
  empleado_id         text not null references empleados (id) on delete cascade,
  empresa_id          text not null references empresas (id) on delete restrict,
  tipo                text not null check (tipo in ('pin','qr')),
  valor_hash_o_token  text not null,
  activo              integer not null default 1,
  created_at          text not null default ${AHORA},
  updated_at          text not null default ${AHORA}
);
create index if not exists idx_metodos_acceso_empleado on metodos_acceso (empleado_id);
create index if not exists idx_metodos_acceso_empresa on metodos_acceso (empresa_id);
create unique index if not exists uq_metodos_acceso_activo
  on metodos_acceso (empleado_id, tipo) where activo = 1;
create unique index if not exists uq_metodos_acceso_valor_empresa
  on metodos_acceso (empresa_id, tipo, valor_hash_o_token) where activo = 1;

create table if not exists dispositivos (
  id            text primary key,
  empresa_id    text not null references empresas (id) on delete restrict,
  tipo          text not null default 'kiosko'
    check (tipo in ('kiosko','movil','lector_fisico')),
  nombre        text,
  ubicacion     text,
  api_key_hash  text,
  activo        integer not null default 1,
  created_at    text not null default ${AHORA},
  updated_at    text not null default ${AHORA}
);
create index if not exists idx_dispositivos_empresa on dispositivos (empresa_id);

create table if not exists registros_asistencia (
  id             text primary key,
  empleado_id    text not null references empleados (id) on delete restrict,
  empresa_id     text not null references empresas (id) on delete restrict,
  metodo         text not null check (metodo in ('facial','huella','pin','qr')),
  tipo           text not null default 'entrada' check (tipo in ('entrada','salida')),
  fecha          text not null default (date('now')),
  hora           text not null default (strftime('%H:%M:%S','now')),
  registrado_en  text not null default ${AHORA},
  dispositivo_id text references dispositivos (id) on delete set null,
  created_at     text not null default ${AHORA}
);
create index if not exists idx_registros_empresa_fecha on registros_asistencia (empresa_id, fecha);
create index if not exists idx_registros_empleado_fecha on registros_asistencia (empleado_id, fecha);

create table if not exists usuarios_admin (
  id            text primary key,
  auth_user_id  text not null unique references auth_users (id) on delete cascade,
  empresa_id    text references empresas (id) on delete restrict,
  nombre        text not null,
  email         text not null,
  rol           text not null default 'rh'
    check (rol in ('super_admin','admin_empresa','rh','supervisor')),
  activo        integer not null default 1,
  created_at    text not null default ${AHORA},
  updated_at    text not null default ${AHORA},
  constraint chk_empresa_por_rol check (rol = 'super_admin' or empresa_id is not null)
);
create index if not exists idx_usuarios_admin_empresa on usuarios_admin (empresa_id);

create table if not exists consentimientos (
  id                        text primary key,
  empleado_id               text not null references empleados (id) on delete restrict,
  empresa_id                text not null references empresas (id) on delete restrict,
  tipo_dato                 text not null
    check (tipo_dato in ('biometrico_facial','biometrico_huella','datos_personales')),
  version_aviso_privacidad  text not null,
  fecha                     text not null default ${AHORA},
  ip                        text,
  otorgado                  integer not null default 1,
  revocado_en               text,
  created_at                text not null default ${AHORA}
);
create index if not exists idx_consentimientos_empleado on consentimientos (empleado_id);
create index if not exists idx_consentimientos_empresa on consentimientos (empresa_id);

create table if not exists auditoria (
  id                 integer primary key autoincrement,
  usuario_admin_id   text references usuarios_admin (id) on delete set null,
  empresa_id         text references empresas (id) on delete set null,
  accion             text not null,
  entidad_afectada   text not null,
  entidad_id         text,
  detalles           text,
  fecha              text not null default ${AHORA}
);
create index if not exists idx_auditoria_empresa_fecha on auditoria (empresa_id, fecha);
`;

/** Metadatos por tabla para que el cliente convierta tipos igual que Postgres. */
export type MetaTabla = {
  /** Columnas boolean (INTEGER 0/1 en SQLite ↔ true/false en JS). */
  booleanas: string[];
  /** Columnas jsonb (TEXT en SQLite ↔ objeto/array en JS). */
  json: string[];
  /** Columnas time: normaliza "HH:MM" → "HH:MM:SS" al escribir (como Postgres). */
  horas: string[];
  /** ¿Tiene updated_at que mantener en cada UPDATE? */
  conUpdatedAt: boolean;
  /** ¿El id es uuid generado por la app? (auditoria usa autoincrement). */
  idUuid: boolean;
};

export const TABLAS: Record<string, MetaTabla> = {
  empresas: {
    booleanas: ["activa"],
    json: ["config_metodos_habilitados"],
    horas: ["hora_entrada", "hora_salida"],
    conUpdatedAt: true,
    idUuid: true,
  },
  empleados: { booleanas: [], json: [], horas: [], conUpdatedAt: true, idUuid: true },
  credenciales_biometricas: {
    booleanas: ["vigente"], json: [], horas: [], conUpdatedAt: true, idUuid: true,
  },
  metodos_acceso: {
    booleanas: ["activo"], json: [], horas: [], conUpdatedAt: true, idUuid: true,
  },
  dispositivos: {
    booleanas: ["activo"], json: [], horas: [], conUpdatedAt: true, idUuid: true,
  },
  registros_asistencia: {
    booleanas: [], json: [], horas: [], conUpdatedAt: false, idUuid: true,
  },
  usuarios_admin: {
    booleanas: ["activo"], json: [], horas: [], conUpdatedAt: true, idUuid: true,
  },
  consentimientos: {
    booleanas: ["otorgado"], json: [], horas: [], conUpdatedAt: false, idUuid: true,
  },
  auditoria: {
    booleanas: [], json: ["detalles"], horas: [], conUpdatedAt: false, idUuid: false,
  },
};

/**
 * Relaciones embebidas soportadas en select() — mismo mecanismo que PostgREST:
 * "dispositivos.select('..., empresas(nombre)')" resuelve vía la FK indicada.
 * Mapa: tabla relacionada → columna FK en la tabla base.
 */
export const FK_RELACIONES: Record<string, string> = {
  empresas: "empresa_id",
  empleados: "empleado_id",
  dispositivos: "dispositivo_id",
  usuarios_admin: "usuario_admin_id",
};
