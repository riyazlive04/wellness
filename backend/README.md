# backend — NestJS API

This folder will contain the NestJS API that sits between the frontend and Supabase.

## Status

Not scaffolded yet. Will be initialized via `nest new .` and wired with:

- Prisma → Supabase Postgres (pooled connection)
- Supabase JWT verification (HS256, `SUPABASE_JWT_SECRET`)
- BullMQ + Redis for async work
- Modules: `auth`, `users`, `organizations`, `clients`, `assessments`, `ai`, `billing`, `marketplace`, `notifications`, `analytics`, `automation`, `uploads`, `compliance`, `audit`

## When ready

```bash
cd backend
npm install
npx prisma generate
npm run start:dev   # http://localhost:3000
```

## Environment

Copy `.env.example` to `.env.local` and fill in:

- `DATABASE_URL` (pooled, port 6543)
- `DIRECT_URL` (direct, port 5432, for migrations)
- `SUPABASE_URL`
- `SUPABASE_JWT_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY` (backend ONLY — never frontend)
- `GEMINI_API_KEY` (rotated key, moved off the browser)

Never commit `.env.local`.
