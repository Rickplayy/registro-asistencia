# Levantar el proyecto localmente

## Requisitos

- Node.js 20+ (probado con 22)
- Una cuenta en [supabase.com](https://supabase.com) (plan gratuito es suficiente)

## 1. Instalar dependencias

```bash
npm install
```

## 2. Crear el proyecto en Supabase

1. En el [dashboard de Supabase](https://supabase.com/dashboard) crea un
   proyecto nuevo (región recomendada: la más cercana a México, p. ej.
   `us-east-1`). Guarda la contraseña de la base de datos.
2. Ve a **Settings → API** y copia:
   - `Project URL`
   - `anon public` key
   - `service_role` key (secreta, solo backend)

## 3. Variables de entorno

```bash
cp .env.example .env.local
npm run generate:key   # genera la ENCRYPTION_KEY (AES-256)
```

Llena `.env.local` con los valores del paso 2 y la llave generada.
**Nunca subas `.env.local` al repo** (ya está en `.gitignore`). En producción
estos valores viven en Vercel (env vars) y la llave de cifrado en Supabase
Vault / KMS.

## 4. Aplicar las migraciones

```bash
npx supabase login          # abre el navegador, una sola vez
npm run db:link             # elige tu proyecto (pide la contraseña de la BD)
npm run db:push             # aplica supabase/migrations/ en orden
```

Esto crea las 9 tablas núcleo **con RLS activo** y las políticas por
`empresa_id`. Reproducible desde cero: en un proyecto vacío, `db:push` deja el
esquema completo.

## 5. Crear la primera empresa y el primer administrador

Las altas de empresas/admins solo se hacen desde el backend (regla de
seguridad), así que la primera se siembra en **SQL Editor** del dashboard:

```sql
-- 1) Empresa
insert into public.empresas (nombre, rfc_empresa)
values ('Mi Empresa Demo', 'DEMO010101AAA')
returning id;
```

Luego crea el usuario en **Authentication → Users → Add user** (email +
contraseña, marca "Auto Confirm User") y vincúlalo (usa el `id` de la empresa
y el `User UID` de Auth):

```sql
-- 2) Perfil administrativo
insert into public.usuarios_admin (auth_user_id, empresa_id, nombre, email, rol)
values ('<USER-UID-DE-AUTH>', '<ID-DE-LA-EMPRESA>', 'Tu Nombre', 'tu@correo.com', 'admin_empresa');
```

## 6. Correr la aplicación

```bash
npm run dev
```

Abre <http://localhost:3000> → redirige a `/login`. Entra con el usuario del
paso 5 y verás el dashboard con tu empresa. `/kiosko` muestra el placeholder
de la Fase 1.

## 7. Pruebas

```bash
npm run test:unit   # unitarias de lib/crypto (sin base de datos)
npm run test:rls    # aislamiento multi-tenant contra tu proyecto Supabase
```

`test:rls` siembra dos empresas de prueba con `service_role`, verifica que un
admin no pueda leer/escribir datos de la otra empresa (ni el rol `anon` nada),
y limpia todo al final. **Debe pasar antes de avanzar a la Fase 1.**

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm run lint` | ESLint |
| `npm run format` | Prettier sobre app/components/lib/tests |
| `npm run build` | Build de producción |
| `npm run generate:key` | Nueva llave AES-256 en base64 |
