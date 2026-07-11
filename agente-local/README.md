# Agente local — lectores de huella físicos

Servicio Node ligero que corre **en el sitio del cliente** y conecta lectores
de huella dedicados (ZKTeco, Suprema, o cualquier terminal con SDK) con la API
central de Registro de Asistencia.

**Privacidad (sección 6 del documento maestro):** la huella se verifica EN la
terminal física — la plantilla biométrica vive en el hardware del cliente y
**nunca** viaja al servidor. El agente solo reenvía el hecho "el empleado N
marcó", autenticado con la API key del dispositivo.

## Requisitos

- Node.js 20+ en una PC del sitio (Windows/Linux) con acceso al lector.
- Un dispositivo tipo **"Lector físico"** dado de alta en el panel
  (Panel → Dispositivos → "+ Nuevo dispositivo" → tipo *Lector físico*).
  Guarda la clave `RA-LECTOR-…`: se muestra una sola vez.
- El método **Huella** habilitado en Configuración de la empresa.
- Los empleados deben tener su **número de empleado** capturado (es el
  identificador que reporta la terminal).

## Instalación y arranque

```bash
cd agente-local
# Sin dependencias externas: solo Node.

# Windows (PowerShell)
$env:AGENTE_API_URL = "https://tu-dominio.com"
$env:AGENTE_API_KEY = "RA-LECTOR-xxxxxxxx..."
node agente.mjs

# Linux
AGENTE_API_URL=https://tu-dominio.com AGENTE_API_KEY=RA-LECTOR-xxx node agente.mjs
```

| Variable | Obligatoria | Descripción |
|---|---|---|
| `AGENTE_API_URL` | Sí | URL base de la API central. **Debe ser `https://`** |
| `AGENTE_API_KEY` | Sí | Clave del dispositivo lector (se valida contra su hash) |
| `AGENTE_DRIVER` | No | `mock` (default), `zkteco`, `suprema` |
| `AGENTE_PERMITIR_HTTP` | No | `1` permite `http://localhost` **solo en desarrollo** |

Para dejarlo como servicio permanente usa el programador de tareas de Windows
(al iniciar sesión) o `systemd` en Linux; el agente reintenta con espera
exponencial si el sitio pierde internet momentáneamente.

## Probar sin hardware (driver mock)

```bash
AGENTE_API_URL=... AGENTE_API_KEY=... node agente.mjs
# [mock] Lector simulado listo. Teclea un número de empleado y Enter…
1001⏎
# [agente] Juan Pérez: entrada registrada a las 08:59
```

El driver mock simula exactamente lo que hará un driver real: por cada huella
verificada por la terminal, emite `{ numeroEmpleado, eventoId }`.

## Contrato de integración (API central)

`POST {AGENTE_API_URL}/api/agente/checkin`

**Headers**

```
Content-Type: application/json
x-api-key: RA-LECTOR-…        ← clave del dispositivo tipo lector_fisico
```

**Body**

```json
{
  "numero_empleado": "1001",
  "evento_id": "uuid-opcional-del-evento-en-la-terminal"
}
```

**Respuestas**

| Código | Significado |
|---|---|
| `200` | Registrada. Body: `{ ok, empleadoNombre, tipo: "entrada"\|"salida", hora }` |
| `401` | API key inválida o dispositivo desactivado |
| `403` | El dispositivo no es `lector_fisico`, o la empresa no tiene huella habilitada |
| `422` | Empleado no reconocido/inactivo, o antirrebote (< 1 min desde la última marcación) |
| `429` | Demasiados intentos fallidos; espera un minuto |

Reglas del transporte:

- **TLS 1.3**: el cliente (`lib/cliente-api.mjs`) fija `minVersion: TLSv1.3` y
  rechaza URLs `http://` salvo `AGENTE_PERMITIR_HTTP=1` (desarrollo).
- El servidor alterna entrada/salida automáticamente y aplica el mismo
  antirrebote que el kiosko web.
- Cada registro queda ligado al `dispositivo_id` del lector (auditoría de
  origen, criterio de la Fase 3) y el evento queda en la bitácora `auditoria`.

## Drivers

Un driver es un módulo con esta interfaz (ver `drivers/mock.mjs` como
referencia):

```js
export function crearDriverX(opciones) {
  return {
    nombre: "x",
    iniciar(onEvento) {
      // Conecta con el SDK del lector; por cada huella VERIFICADA por la
      // terminal llama: onEvento({ numeroEmpleado: "1001", eventoId: "..." })
    },
    detener() { /* libera el lector */ },
  };
}
```

Para ZKTeco: el SDK "Standalone SDK" (Windows, COM/DLL) expone eventos
`OnAttTransactionEx` con el `EnrollNumber` del empleado — mapea ese valor a
`numeroEmpleado`. Para Suprema: BioStar 2 Device SDK, evento de autenticación
exitosa con `userID`. En ambos casos el mapeo terminal→sistema es el número de
empleado, que debe coincidir con el capturado en la ficha del empleado.
