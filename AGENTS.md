<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Proyecto: Registro de Asistencia

Lee **ARCHITECTURE.md** (raíz) antes de cualquier cambio: contiene el stack
decidido, la estructura de carpetas y las reglas inquebrantables (RLS por
`empresa_id` en toda tabla, cero credenciales en el código, cifrado de campos
sensibles vía `lib/crypto`, reglas LFT no configurables). La fuente completa de
decisiones es `docs/documento-maestro.txt`.
