# Modo local (rama `local`) — cero dependencias externas

Esta rama reemplaza Supabase (base de datos + autenticación) por una
implementación 100 % local. No se necesita cuenta de ningún servicio, ni
conexión a internet, ni variables de entorno: `npm install && npm run dev`.

## Qué reemplaza a qué

| Antes (Supabase) | Ahora (local) |
|---|---|
| PostgreSQL gestionado | SQLite vía `node:sqlite` (integrado en Node ≥ 22.5, sin binarios de npm) en `data/registro-asistencia.db` |
| Supabase Auth (GoTrue) | `lib/local/auth.ts`: cuentas en la tabla `auth_users`, contraseñas con scrypt, sesión en cookie httpOnly `ra_session` firmada con HMAC-SHA256 |
| Query builder PostgREST (`from().select()…`) | `lib/local/client.ts`: misma API (`select/insert/update/delete`, filtros, `single/maybeSingle`, `count`, relaciones embebidas `empresas(nombre)`) |
| Row Level Security por `empresa_id` | Emulación fiel de las políticas de `supabase/migrations/20260709000002_rls_policies.sql` en `POLITICAS` (`lib/local/client.ts`), verificada por `npm run test:rls` |
| anon key / service_role key | Contexto `anon`/`usuario` (cliente de sesión) y contexto `service` (`lib/db/admin.ts`, solo backend) |
| Supabase Vault (ENCRYPTION_KEY) | Se genera sola la primera vez y persiste en `data/encryption.key` (fuera del repo; `.env.local` la puede sobreescribir) |
| Migraciones `supabase db push` | Esquema idempotente en `lib/local/schema.ts`, aplicado al abrir la base |

`lib/db/server.ts`, `lib/db/admin.ts` y `lib/db/auditoria.ts` conservan su
interfaz, por lo que el resto del código de la app no cambió.

## Archivos locales (carpeta `data/`, en .gitignore)

- `registro-asistencia.db` — la base SQLite (WAL). Bórrala para empezar de cero.
- `encryption.key` — llave AES-256. **No la borres si ya tienes datos**: cifra
  CURP/RFC/fecha de nacimiento y valida PIN, QR y sesiones.

## Reglas que se conservan (ver ARCHITECTURE.md)

- Aislamiento multi-tenant por `empresa_id` (emulado; `npm run test:rls`).
- Marcaciones, auditoría y consentimientos inmutables desde el cliente de sesión.
- Campos sensibles cifrados con AES-256-GCM antes de tocar la base.
- PIN solo como hash HMAC; QR rotativo TOTP; login admin separado del kiosko.
- La base jamás se expone al navegador (no existe cliente de datos de browser).

## Endurecimiento (auditoría 2026-07)

- **WITH CHECK emulado en UPDATE**: un cliente de sesión no puede reasignar
  filas a otro tenant cambiando `empresa_id` (error 42501, como en Postgres).
- **`auth_users` inalcanzable vía `from()`** en cualquier contexto y acción
  (42P01), igual que PostgREST no expone el esquema `auth`.
- **Joins embebidos** (`empresas(nombre)`) también respetan el alcance RLS de
  la tabla relacionada.
- **Login**: tiempo constante aunque el correo no exista (hash señuelo) y
  bloqueo temporal tras 5 intentos fallidos en 15 min por correo.
- **Sesiones**: el token lleva una huella del hash de contraseña; cambiar la
  contraseña (p. ej. con `npm run reset-password`) o borrar la cuenta invalida
  todas las sesiones emitidas antes.
- **Kiosko**: freno anti fuerza bruta por dispositivo (10 fallos/min) y un PIN
  con formato inválido responde 422, no 500.
- **Headers**: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` y
  `Permissions-Policy` en todas las respuestas (next.config.ts).
- Cobertura en `tests/rls-isolation.test.ts` y `tests/auth-local.test.ts`.

## Limitaciones del modo local

- **Recuperar contraseña**: no hay correo saliente. `/login/recuperar` responde
  éxito pero no envía nada; usa en su lugar:

  ```bash
  npm run reset-password -- tu@correo.com NuevaContraseña123
  ```

- Un solo proceso escribe a la vez (SQLite WAL): perfecto para desarrollo y
  despliegues de una sola instancia; para multi-instancia, volver a Postgres.
- `supabase/` se conserva como referencia del esquema/políticas originales,
  pero ya no se usa.

## Pruebas

```bash
npm test            # todo (unitarias + aislamiento multi-tenant)
npm run test:rls    # solo aislamiento — corre contra SQLite en memoria
```
