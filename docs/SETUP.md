# Levantar el proyecto localmente

> Rama `local`: **sin dependencias externas** (no Supabase, no cuentas, no
> internet). Detalles del diseño en [LOCAL.md](./LOCAL.md).

## Requisitos

- Node.js **22.5+** (probado con 24) — usa el módulo integrado `node:sqlite`.

## 1. Instalar y correr

```bash
npm install
npm run dev
```

Eso es todo. Al arrancar por primera vez se crean solos:

- `data/registro-asistencia.db` — base SQLite con el esquema completo.
- `data/encryption.key` — llave AES-256 (cifrado de CURP/RFC, PIN, QR, sesiones).

Ambos están en `.gitignore`. Si prefieres fijar la llave por variable de
entorno, copia `.env.example` a `.env.local` y usa `npm run generate:key`.

## 2. Crear la primera empresa y el primer administrador

Abre <http://localhost:3000/registro> y llena el formulario: crea la empresa,
la cuenta del administrador e inicia sesión de una vez. (Ya no hace falta
sembrar nada por SQL.)

### Opción rápida: base de demo con datos de prueba

Para probar sin capturar nada a mano, siembra una empresa con **15 empleados**
(con PIN y QR), 2 kioskos y ~2 semanas de asistencia:

```bash
npm run seed:demo
```

Imprime las credenciales del admin, las claves de los kioskos y el PIN de cada
empleado. Es idempotente (rehacerlo re-siembra la empresa de demo). Detén el
servidor antes de correrlo si está usando la misma base.

## 3. Pruebas

```bash
npm test            # unitarias + aislamiento multi-tenant
npm run test:unit   # solo unitarias (crypto, PIN/QR, reporte)
npm run test:rls    # aislamiento multi-tenant (SQLite en memoria)
```

`test:rls` siembra dos empresas de prueba con el cliente de servicio, verifica
que un admin no pueda leer/escribir datos de la otra empresa (ni el rol `anon`
nada), y limpia todo al final. **Debe pasar antes de avanzar de fase.**

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm run lint` | ESLint |
| `npm run format` | Prettier sobre app/components/lib/tests |
| `npm run build` | Build de producción |
| `npm run generate:key` | Nueva llave AES-256 en base64 |
| `npm run reset-password -- <email> <contraseña>` | Reinicia la contraseña de una cuenta local |
| `npm run seed:demo` | Siembra una empresa de demo (admin + 15 empleados + asistencia) |

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

## Empezar de cero

Borra `data/registro-asistencia.db` (y sus archivos `-wal`/`-shm`) con la app
detenida. Conserva `data/encryption.key` solo si quieres reusar la llave.
