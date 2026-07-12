# Notas de seguridad operativa (Fase 5)

## Rate limiting de endpoints públicos

| Endpoint | Llave | Límite |
|---|---|---|
| `POST /api/kiosko/vincular` | IP | 5 fallos / min |
| `POST /api/kiosko/checkin` | dispositivo | 10 fallos / min |
| `POST /api/kiosko/huella/registro/opciones` | dispositivo | 10 intentos / min |
| `POST /api/agente/checkin` | dispositivo | 10 fallos / min |
| Login administrativo | — | Lo limita Supabase Auth en su propio servicio (no pasa por nuestra API). |

**Alcance honesto:** el limitador (`lib/seguridad/rate-limit.ts`) vive en la
memoria del proceso. En despliegues serverless con varias instancias cada una
cuenta por separado: mitiga fuerza bruta casual y scripts simples, pero para
ataques distribuidos se recomienda además un límite en el borde (Cloudflare /
WAF del hosting) al salir a producción.

## Aislamiento multi-tenant

- RLS activo en TODAS las tablas desde la Fase 0; las escrituras del kiosko y
  del agente pasan por la API con `service_role` acotando por el dispositivo.
- La **matriz de aislamiento tabla por tabla** (`tests/rls-isolation.test.ts`)
  siembra una fila por tabla en una empresa B y verifica que el admin de A no
  puede leerla (ni filtrando ni por id) ni insertar en el tenant ajeno.
  Corre en CI (`.github/workflows/ci.yml`) — configura los secretos de
  Supabase en GitHub para cumplir el criterio de la Fase 5.
- Regla de trabajo: **ninguna feature nueva está terminada sin su entrada en
  la matriz** (agregar la semilla de su tabla al test).

## Pagos

- Nunca se guardan datos de tarjeta: el checkout es la página hospedada del
  proveedor certificado (Stripe). Este backend solo guarda plan, estado y la
  referencia externa de la suscripción.
- El webhook de Stripe exige firma válida (`STRIPE_WEBHOOK_SECRET`); sin
  firma, se descarta.
- Sin `STRIPE_SECRET_KEY`, opera el proveedor SIMULADO (desarrollo/demo): el
  flujo es idéntico pero sin dinero real, con token cifrado de un solo uso.
