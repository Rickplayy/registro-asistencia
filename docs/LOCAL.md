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
