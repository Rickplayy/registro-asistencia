# Row Level Security por tabla

Las políticas RLS **canónicas y versionadas** viven en
[`supabase/migrations/20260709000002_rls_policies.sql`](../migrations/20260709000002_rls_policies.sql)
para que sean reproducibles desde cero junto con el esquema (una sola fuente de
verdad, sin duplicación).

## Resumen del modelo de acceso

| Tabla | anon | authenticated (misma empresa) | Notas |
|---|---|---|---|
| `empresas` | ∅ | SELECT; UPDATE solo `admin_empresa` | Alta de empresas solo vía backend (`service_role`). |
| `empleados` | ∅ | SELECT; INSERT/UPDATE `admin_empresa`/`rh`; DELETE `admin_empresa` | |
| `credenciales_biometricas` | ∅ | CRUD solo `admin_empresa`/`rh` | Dato sensible; verificación biométrica corre en backend. |
| `metodos_acceso` | ∅ | SELECT; escritura `admin_empresa`/`rh` | PIN siempre con hash. |
| `registros_asistencia` | ∅ | Solo SELECT | Nadie edita/borra marcaciones desde el cliente; el alta la hace la API validando el dispositivo. |
| `dispositivos` | ∅ | SELECT; escritura solo `admin_empresa` | |
| `usuarios_admin` | ∅ | Solo SELECT (propia fila + misma empresa) | Altas y cambios de rol solo vía backend, para impedir auto-escalamiento. |
| `consentimientos` | ∅ | SELECT; INSERT `admin_empresa`/`rh` | Evidencia legal: jamás UPDATE/DELETE desde cliente. |
| `auditoria` | ∅ | SELECT + INSERT (propia empresa) | Bitácora inmutable: sin UPDATE/DELETE. |

Funciones auxiliares (`security definer`, esquema `app`):

- `app.empresa_actual()` → `empresa_id` del usuario autenticado.
- `app.es_super_admin()` → `true` para el operador del SaaS.
- `app.rol_actual()` → rol del usuario para políticas por rol.

**Regla del proyecto:** toda tabla nueva DEBE crearse con `empresa_id`,
`enable row level security` y sus políticas en la misma migración. La prueba
de aislamiento (`npm run test:rls`) debe pasar antes de avanzar de fase.
