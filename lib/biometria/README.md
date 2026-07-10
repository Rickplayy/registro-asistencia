# lib/biometria

Fases 2 y 3 (ver hoja de ruta). Aquí vivirá:

- Extracción y comparación de plantillas faciales (face-api.js o API cloud).
- Enrolamiento/verificación de huella vía WebAuthn.

Reglas ya vigentes desde Fase 0:

- **Nunca** se guarda la imagen facial ni la huella cruda: solo la plantilla
  matemática, cifrada con `lib/crypto`, en `credenciales_biometricas`.
- Antes de procesar biometría se verifica un consentimiento vigente en la
  tabla `consentimientos`; si no existe, se rechaza el registro (LFPDPPP).
