# Registro de Asistencia — SaaS multi-empresa

Checador digital para el mercado mexicano: registro electrónico y verificable
de jornada laboral, en cumplimiento de la reforma laboral obligatoria a partir
del **1 de enero de 2027**.

- **Arquitectura y reglas del proyecto**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Cómo levantarlo localmente**: [docs/SETUP.md](./docs/SETUP.md)
- **Documento maestro de decisiones**: `docs/documento-maestro.txt`

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui · PostgreSQL vía
Supabase (Auth + RLS + Storage) · Vercel + Supabase (MVP).

## Estado

**Fase 0 — Cimientos**: estructura del repo, esquema inicial con Row Level
Security en todas las tablas, login de administrador, módulo de cifrado
AES-256-GCM y prueba de aislamiento multi-tenant (`npm run test:rls`).
