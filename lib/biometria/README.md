# lib/biometria

**Fase 2 (activa): reconocimiento facial.** Fase 3 (huella vía WebAuthn) pendiente.

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
