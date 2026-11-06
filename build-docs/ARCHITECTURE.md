# Architecture

## Stack
- Frontend (web): React + Vite + TypeScript, Tailwind + shadcn/ui, TanStack Query, Recharts.
- Mobile: React Native / Expo (expo-router), self-hosted OTA updates.
- Backend: NestJS, versioned REST under `/api/v1`, Prisma + raw SQL.
- Database: Supabase Postgres (migrations in `supabase/migrations/`).
- AI: Google Gemini 2.5 Flash (vision, voice, assistant), function-calling tools.
- Payments: Razorpay (subscriptions, orders, webhooks, GST invoicing).
- Storage: Supabase Storage (`client-files`, `progress-photos` buckets), usage enforced against plan cap.
- Deployment: backend on Render (off `main`) + self-hosted VPS (nusi.sirahagents.com, nginx + pm2); mobile via OTA.

## Module boundaries
- `backend/src/workspaces` — tenant creation (`WorkspacesService.createForOwner`), self-serve only; no admin-create-workspace endpoint exists.
- `backend/src/clients` — client roster, daily logs, meals, supplements.
- `backend/src/programs` — program templates → tasks → versioned assignments → daily completion toggle (`program_task_logs`, boolean only, no media proof).
- `backend/src/usage` — AI credit metering (`UsageService`), gates on `ai_usage_events` row count vs plan cap; fails open on lookup error; degrades to deterministic fallback over quota rather than hard-blocking.
- `backend/src/nutrition-engine` — IFCT-2017 macro/calorie math; deterministic, never calls `usage.record` — not AI-metered.
- `backend/src/billing` — plans/pricing (`plans.ts`), Razorpay subscriptions, credit top-ups.
- `backend/src/admin` — Super Admin console; workspace suspend/activate/delete, no tenant creation.

## Request flow
JWT (Supabase auth) → RolesGuard → FeaturesGuard (plan entitlement) → tenant-scoped query (`workspace_id`) → Supabase RLS as defence-in-depth.

## Three independent gates
Quotas (`LimitsService`), Features (`common/features.ts`), Permissions (role-based). Orthogonal — a role can allow an action the plan still blocks (402).

## Known gaps
- Program tasks have no photo/video proof-of-completion field or task type (`program_template_tasks.type` is a validated string: `activity, nutrition, habit, task, checkin` — no media type).
- No "additional food recommended" entity distinct from meals; closest match is `client_supplements`/`supplement_logs`.
