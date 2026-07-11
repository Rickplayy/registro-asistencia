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

## 6. Modelos de reconocimiento facial (Fase 2)

```bash
npm run models:download   # descarga los modelos de face-api a public/modelos-face
```

Los modelos se auto-hospedan para que el kiosko no haga ninguna llamada
externa al procesar rostros. Solo hace falta correrlo una vez (los archivos
quedan versionados en el repo). Nota: la cámara del navegador requiere
HTTPS o `localhost`.

## 7. Correr la aplicación

```bash
npm run dev
```

Abre <http://localhost:3000> → redirige a `/login`. Entra con el usuario del
paso 5 y verás el dashboard con tu empresa. `/kiosko` muestra el placeholder
de la Fase 1.

## 8. Pruebas

```bash
npm run test:unit   # unitarias de lib/crypto y lib/biometria (sin base de datos)
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

## Probar el flujo completo de la Fase 1 (MVP)

1. **Crear empresa**: abre `/registro`, llena los datos → entras al dashboard.
2. **Alta de empleado**: Empleados → "+ Alta de empleado" (2 pasos, con la
   casilla de consentimiento). Al guardar se muestra su **PIN una sola vez**.
3. **Crear kiosko**: Dispositivos → "+ Nuevo kiosko" → copia la clave.
4. **Vincular kiosko**: abre `/kiosko` (idealmente en otro navegador o
   ventana privada), pega la clave.
5. **Check-in**: en el kiosko elige PIN y teclea el del empleado → banner
   verde con nombre y hora. Para QR: en la ficha del empleado pulsa "Mostrar
   QR vigente" y escanéalo/tecléalo en el kiosko (rota cada 30 s).
6. **Dashboard**: la marcación aparece en tarjetas y registros recientes.
7. **Exportar**: Reportes → "Exportar Excel" o "Exportar CSV".

## Probar el flujo de la Fase 2 (biometría facial)

1. **Habilitar el método**: Configuración → marca "Biometría facial" → guardar.
2. **Enrolar**: en el alta de empleado (paso 3) o en su ficha ("Enrolar
   rostro"): marca la casilla de **consentimiento biométrico** (sin ella la
   cámara no se activa y el servidor rechaza el enrolamiento), mira a la
   cámara y espera las 3 capturas.
3. **Fichar**: en `/kiosko` pulsa **Rostro** → mirada de frente → banner verde
   con nombre y hora. Si el rostro no coincide, el kiosko sugiere usar PIN.
4. **Verificar cumplimiento**:
   - `select tipo, vigente, left(plantilla_cifrada, 20) from credenciales_biometricas;`
     → la plantilla empieza con `v1:` (cifrada); no hay ninguna imagen.
   - `select accion, detalles from auditoria order by fecha desc limit 10;`
     → aparecen `biometria.enrolamiento_facial`, `biometria.verificacion_checkin`
     y `biometria.lectura_credenciales`.

## Probar el flujo de la Fase 3 (huella digital)

Requiere un aparato con autenticador de plataforma (Windows Hello, Touch ID o
huella de Android) y HTTPS o `localhost`.

1. **Habilitar el método**: Configuración → marca "Huella digital" → guardar.
2. **Consentimiento**: en la ficha del empleado → tarjeta "Huella digital
   (WebAuthn)" → "Registrar consentimiento" (LFPDPPP; queda con fecha e IP).
3. **Enrolar EN el kiosko**: `/kiosko` → Huella → "Primera vez aquí" → teclea
   el PIN del empleado → sigue las instrucciones del sensor. Sin
   consentimiento previo, el servidor rechaza este paso.
4. **Fichar**: `/kiosko` → Huella → "Fichar con mi huella" → sensor → banner
   verde. El servidor solo verificó una firma: la huella nunca salió del
   aparato (revisa `credenciales_webauthn`: solo hay claves públicas).
5. **Lector físico (opcional)**: crea un dispositivo tipo "Lector físico",
   copia su clave `RA-LECTOR-…` y sigue `agente-local/README.md` — el driver
   `mock` permite probar todo el contrato sin hardware.

## Probar el flujo de la Fase 4 (reportes STPS)

1. **Reporte**: Reportes → ajusta el periodo → la tabla muestra días
   trabajados, retardos, faltas y horas por empleado.
2. **Exportar**: botones "Exportar Excel / PDF / CSV" (los formatos salen del
   registro de adaptadores — ver `lib/reportes/README.md` para agregar el
   formato STPS definitivo cuando se publique).
3. **Alertas de jornada**: el dashboard muestra la tarjeta "Alertas de
   jornada" con el límite del año (48 h en 2026); alerta en ámbar desde el
   90% y en rojo al excederlo.
4. **Verificar auditoría**:
   `select accion, detalles from auditoria where accion like 'reporte.%' order by fecha desc;`
   → cada consulta (`reporte.consulta`) y cada exportación
   (`reporte.exportacion`) con quién, periodo, formato y nº de empleados.
