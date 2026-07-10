# Arquitectura — Registro de Asistencia (SaaS multi-empresa)

> Referencia permanente para el desarrollo con Claude Code. La fuente completa
> de decisiones es `docs/07_Documento_Maestro_Registro_Asistencia.docx`
> (texto plano en `docs/documento-maestro.txt`).

## Qué es

SaaS multi-empresa de registro electrónico de jornada laboral (checador
digital) para el mercado mexicano, en cumplimiento de la reforma laboral que
exige registro electrónico y verificable a partir del **1 de enero de 2027**.

## Stack (decidido, no cambiar sin actualizar este archivo)

- **Frontend/Backend**: Next.js 16 App Router + TypeScript + Tailwind CSS v4 + shadcn/ui — monolito modular, sin microservicios.
- **Base de datos**: PostgreSQL vía Supabase (Auth + Row Level Security + Storage).
- **Hosting MVP**: Vercel + Supabase.
- **Paleta**: "Confianza corporativa" (sección 7.1 del doc maestro): marca `#1E3A5F`, interactivo `#2563EB`, éxito `#16A34A`, advertencia `#F59E0B`, error `#DC2626`. Verde/ámbar/rojo son fijos en cualquier tema.

## Estructura del repo (sección 12 del doc maestro)

```
registro-asistencia/
├── app/
│   ├── (admin)/            → login, dashboard, empleados, reportes, nómina
│   ├── (kiosko)/           → pantalla de fichaje (facial/huella/QR/PIN)
│   ├── (empleado)/         → portal del empleado (fase posterior)
│   └── api/                → API routes (asistencia, empleados, nomina, auth)
├── components/             → componentes UI reutilizables (shadcn/ui)
├── lib/
│   ├── db/                 → clientes Supabase (client/server/admin) + auditoría
│   ├── crypto/             → cifrado AES-256-GCM de campos sensibles
│   ├── auth/               → sesión admin, onboarding, PIN (hash) y QR (TOTP)
│   ├── asistencia/         → check-in del kiosko, métricas, reportes, export
│   ├── empleados/          → actions de empleados, dispositivos y empresa
│   ├── biometria/          → plantillas faciales/huella (Fases 2-3)
│   └── nomina/             → motor de incidencias y exportación (Fase 6)
├── supabase/
│   ├── migrations/         → esquema SQL versionado (fuente de verdad)
│   └── policies/           → documentación RLS por tabla
├── agente-local/           → (opcional) integración lectores físicos (Fase 3)
├── docs/                   → documento maestro + guías
├── proxy.ts                → refresco de sesión + protección de rutas
└── tests/                  → unitarios (crypto) + integración (RLS)
```

## Reglas inquebrantables

1. **Ninguna tabla sensible sin RLS por `empresa_id`.** Toda tabla nueva se
   crea con `empresa_id`, `enable row level security` y sus políticas en la
   misma migración. Sin política ⇒ acceso denegado.
2. **Ninguna llave de cifrado ni credencial en el código o el repo.**
   `.env.local` + gestor de secretos (Vercel env vars, Supabase Vault).
3. **No se avanza de fase sin que `npm run test:rls` pase** contra el proyecto
   real (prueba de que un tenant no lee datos de otro).
4. **Datos sensibles cifrados a nivel de columna** (AES-256-GCM vía
   `lib/crypto`): CURP, RFC, fecha de nacimiento; después salarios y
   plantillas biométricas. Nunca se guarda imagen facial/huella cruda.
5. **La base nunca se expone directa al cliente**: el navegador usa la anon
   key acotada por RLS; `service_role` solo en backend (`lib/db/admin.ts`).
6. **Las marcaciones de asistencia son inmutables desde el cliente** (solo
   SELECT); las escribe la API validando el dispositivo. `auditoria` y
   `consentimientos` tampoco admiten UPDATE/DELETE desde el cliente.
7. **Reglas LFT no configurables** (sección 2.3 del doc maestro): sin
   descuentos por retardos en pesos, tope de descuento ≤ 30%, alertas de
   faltas — el sistema debe impedir configuraciones que violen la ley.
8. **Login admin separado del check-in de empleados**: nunca comparten flujo.

## Modelo de acceso (RLS)

- `anon`: cero acceso a datos.
- `authenticated`: solo filas de su empresa vía `app.empresa_actual()`
  (función `security definer` sobre `usuarios_admin`).
- Roles: `super_admin` (operador del SaaS, acceso global), `admin_empresa`,
  `rh`, `supervisor` — permisos por rol en las políticas.
- `service_role`: bypass de RLS, solo backend.
- Altas de empresas y de usuarios admin: solo vía backend (service_role),
  para impedir auto-escalamiento de privilegios.

## Decisiones clave de la Fase 1

- **PIN**: 6 dígitos, HMAC-SHA256 determinista con llave HKDF derivada de
  `ENCRYPTION_KEY`, amarrado a la empresa. Nunca en claro; búsqueda por hash.
- **QR rotativo**: secreto por empleado (cifrado AES-GCM) + TOTP de 8 dígitos
  con paso de 30 s y ventana ±1. Payload `RA1.<metodo_id>.<código>`. Una foto
  del código expira sola.
- **Kiosko**: se vincula con una clave de dispositivo (solo se guarda su hash
  SHA-256) en cookie httpOnly. El check-in usa service_role pero SIEMPRE
  acotado a la empresa del dispositivo; alterna entrada/salida y trae
  antirrebote de 1 minuto.
- **Retardos/faltas (MVP)**: contra `empresas.hora_entrada` + tolerancia;
  falta = día hábil (L-V) sin entrada. Se refina en Fases 4/6.
- **Consentimiento**: toda alta de empleado inserta en `consentimientos`
  (datos_personales, versión de aviso, IP). Sin la casilla marcada no se crea.
- **Auditoría activa**: alta/edición/baja de empleado, lectura de datos
  sensibles descifrados, regeneración de PIN, cambios de empresa/dispositivos.

## Hoja de ruta

Fase 0 ✔ → 1 MVP ✔ (PIN/QR + dashboard + export) → 2 Facial → 3 Huella +
hardware → 4 Reportes STPS → 5 Escalamiento → 6 Incidencias/nómina
(proyección; **nunca** timbrado CFDI).
