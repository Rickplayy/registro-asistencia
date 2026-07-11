# lib/biometria

**Fase 2: reconocimiento facial** y **Fase 3: huella vía WebAuthn** — activas.

## Cómo funciona el flujo facial

1. **Captura en el navegador** (`components/biometria/captura-rostro.tsx`):
   face-api.js (`@vladmandic/face-api`) corre EN EL CLIENTE con modelos
   auto-hospedados en `public/modelos-face` (`npm run models:download`).
   Del video solo se extrae el **descriptor matemático de 128 números**;
   ningún frame ni fotografía sale del dispositivo.
2. **Enrolamiento** (`enrolamiento.ts`, server action): promedia 3 capturas,
   valida con `esDescriptorValido` (barrera anti-imagen), verifica en servidor
   un consentimiento `biometrico_facial` vigente en `consentimientos`
   (bloqueante, LFPDPPP), cifra la plantilla con `lib/crypto` (AES-256-GCM) y
   la guarda en `credenciales_biometricas` (tipo `facial`). Re-enrolar
   desactiva la credencial anterior, nunca la sobreescribe.
3. **Check-in en kiosko** (`lib/asistencia/checkin.ts` → `buscarPorRostro`):
   identificación 1:N contra las plantillas descifradas de empleados activos
   **con consentimiento vigente**; umbral estricto (`UMBRAL_DISTANCIA = 0.5`).

## Cómo funciona el flujo de huella (WebAuthn)

1. **El dato biométrico jamás sale del aparato**: la huella la verifica el
   autenticador del dispositivo (Windows Hello / Touch ID / Android). El
   servidor solo guarda la **clave pública** del passkey en
   `credenciales_webauthn` — un dato criptográfico, no biométrico.
2. **Consentimiento** (`huella.ts`): RH registra el consentimiento
   `biometrico_huella` desde la ficha; sin él, el enrolamiento y el check-in
   se rechazan en servidor.
3. **Enrolamiento EN el kiosko** (`webauthn.ts` + `/api/kiosko/huella/*`): el
   empleado se identifica con su PIN y crea el passkey en ese aparato
   (credencial descubrible, `userVerification: required`). El reto viaja en
   cookie httpOnly cifrada de 5 minutos.
4. **Check-in**: aserción con `allowCredentials` vacío — el sensor identifica
   al empleado; el servidor verifica firma, reto, origen, consentimiento y
   contador de firmas (anticlonación) antes de registrar.
5. **Hardware dedicado**: los lectores físicos van por `agente-local/` →
   `/api/agente/checkin` (la terminal verifica la huella; ver su README).

## Reglas inquebrantables

- **Nunca** se guarda la imagen facial ni la huella cruda: solo la plantilla
  matemática, cifrada con `lib/crypto`, en `credenciales_biometricas`.
  `esDescriptorValido` rechaza cualquier payload que no sea exactamente un
  arreglo de 128 números finitos (ver `tests/biometria.test.ts`).
- Sin consentimiento vigente en `consentimientos` no se enrola ni se verifica:
  la comprobación es **en servidor**, la UI solo es la primera barrera.
- Todo acceso a `credenciales_biometricas` queda en `auditoria`: lecturas a
  nivel de aplicación (`biometria.lectura_credenciales`,
  `biometria.verificacion_checkin`) y escrituras además por trigger de BD
  (migración `20260710000004`).
