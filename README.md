# Registro de Asistencia — SaaS multi-empresa

Checador digital para el mercado mexicano: registro electrónico y verificable
de jornada laboral, en cumplimiento de la reforma laboral obligatoria a partir
del **1 de enero de 2027**.

- **Arquitectura y reglas del proyecto**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Cómo levantarlo localmente**: [docs/SETUP.md](./docs/SETUP.md)
- **Documento maestro de decisiones**: `docs/documento-maestro.txt`

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui.

> **Rama `local`**: base de datos y autenticación 100 % locales — SQLite vía
> `node:sqlite` + auth propia (scrypt + cookies firmadas), sin Supabase ni
> ningún servicio externo. `npm install && npm run dev` y listo. Detalles en
> [docs/LOCAL.md](./docs/LOCAL.md). (En `master`, el stack original es
> PostgreSQL vía Supabase con Auth + RLS, pensado para Vercel + Supabase.)

## Estado

- **Fase 0 — Cimientos** ✔: estructura del repo, esquema inicial con Row
  Level Security en todas las tablas, login de administrador, módulo de
  cifrado AES-256-GCM y prueba de aislamiento multi-tenant (`npm run test:rls`).
- **Fase 1 — MVP** ✔: onboarding de empresa, CRUD de empleados con
  consentimiento y cifrado, kiosko con PIN (hash) y QR rotativo (TOTP 30 s),
  dashboard con tarjetas y registros recientes, reportes con exportación
  Excel/CSV, auditoría activa. Ver el flujo de prueba en
  [docs/SETUP.md](./docs/SETUP.md).

> En esta rama no hay nada que conectar: la base y la autenticación son
> locales. Verifica el aislamiento multi-tenant con `npm run test:rls`.
