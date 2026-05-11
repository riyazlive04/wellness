# 🌿 Sheizen Wellness — Full-Stack SaaS

Healthcare & wellness platform bridging nutritionists and clients with assessments, AI-assisted plans, real-time messaging, and gamification.

This repository is a **monorepo** mid-migration from a Supabase-only architecture to a proper full-stack `Frontend → Backend → Supabase` architecture.

---

## 📁 Layout

```
.
├── frontend/        React 18 + Vite + TS + Tailwind + shadcn/ui + PWA
├── backend/         NestJS API (in progress) — Prisma → Supabase Postgres
├── shared/          Cross-package types, validation schemas, constants
├── docker/          Dockerfiles + compose manifests + Caddy config
├── scripts/         Operational utilities (seed, key rotation, audits)
├── docs/            Architecture, ADRs, runbooks, generated API specs
├── supabase/        Migrations + config for the Supabase project
└── _legacy_scripts/ Quarantined pre-migration scripts (gitignored)
```

---

## 🚀 Quick start

### Frontend (works today)

```bash
cd frontend
npm install
cp .env.example .env.local   # then fill in YOUR dev Supabase keys
npm run dev                   # http://localhost:8080
```

### Backend (coming soon)

Not scaffolded yet. See `backend/README.md`.

---

## 🛡️ Important

- The frontend currently points at an **isolated dev Supabase project**, not the original production project.
- The production project (`ljxgaycjomnyfihdsgke`) is intentionally **not referenced anywhere** in this codebase.
- `_legacy_scripts/` contains old scripts that used to operate on production. **Do not run them.**
- All env files are gitignored. `*.example` files are the safe templates.

---

## ✨ Key Features (existing frontend)

- **Auth & Roles** — Supabase Auth, role-based access (Admin vs Client), 15-min inactivity timeout with cross-tab persistence.
- **Dashboards** — Real-time logging (calories, meals with photos, water, activity, weight). Admin hub for client management.
- **Assessments & AI** — Sleep / Stress / general Health assessments; AI-generated insights; pending-review queue.
- **Messaging & Community** — WhatsApp-style real-time chat; community feed with likes, comments, hashtags.
- **Nutrition** — Meal management via Supabase Storage; recipe builder; urgent food approvals.
- **Gamification** — Duolingo-style achievement progression.
- **PWA** — Installable, offline-capable.

---

## 🧱 Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query, PWA |
| Backend (planned) | NestJS, Prisma, Zod, BullMQ, Redis |
| Auth | Supabase Auth (HS256 JWT, verified server-side) |
| Database | Supabase Postgres (Prisma owns schema) |
| Storage | Supabase Storage (signed URLs minted by backend) |
| Realtime | Supabase Realtime (subscribe directly from frontend) |
| Infra | Docker, Caddy, VPS |

---

## 📚 More

- Architecture docs: `docs/architecture/`
- Decisions: `docs/adr/`
- Backend setup: `backend/README.md`
- Shared types: `shared/README.md`
