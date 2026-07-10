# agente-local

Fase 3 (opcional, plan premium). Servicio Node que corre en el sitio del
cliente y traduce eventos de checadores físicos (ZKTeco/Suprema vía SDK) a la
API central por HTTPS (TLS 1.3), autenticándose con la API key del dispositivo
(guardada como hash en la tabla `dispositivos`).
