-- =============================================================================
-- SIRAH LIFE — PRODUCTION migration bundle
-- Target: prod Supabase project ljxgaycjomnyfihdsgke
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run: every statement is IF NOT EXISTS / ON CONFLICT guarded.
-- Wrapped in a single transaction: any error rolls the WHOLE bundle back.
-- Covers the 9 migrations that are on dev but not yet on prod.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 20260613150000_announcement_role_targeting
-- -----------------------------------------------------------------------------
-- Announcement audience targeting by role.
--
-- platform_announcements already supports per-workspace targeting via
-- target_workspace_ids (empty = all workspaces). This adds an orthogonal
-- role filter so a super admin can address, e.g., "all nutritionists"
-- (across every workspace, or combined with a workspace subset).
--
-- Semantics (enforced in the /announcements/active query):
--   target_roles empty  → visible to every role
--   target_roles set    → visible only to members whose workspace_member_role
--                          is in the array. Clients / unaffiliated viewers
--                          (role IS NULL) never match a non-empty target_roles.

ALTER TABLE public.platform_announcements
  ADD COLUMN IF NOT EXISTS target_roles text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.platform_announcements.target_roles IS
  'Empty = all roles. Otherwise only workspace_member_role values listed here see the announcement.';


-- -----------------------------------------------------------------------------
-- 20260613160000_workspace_branding
-- -----------------------------------------------------------------------------
-- Real workspace branding (Phase 1).
--
-- workspaces already has logo_url + brand_color. This adds the remaining
-- branding fields so the practice's colours, tagline, and white-label flag
-- persist server-side and reach every client on every device (replacing the
-- localStorage-only mock).
--   brand_color  -> primary brand colour (already present)
--   brand_accent -> secondary/accent colour (new)
--   tagline      -> shown on the client portal (new)
--   white_label  -> Enterprise: hide SIRAH branding (new)

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS brand_accent text,
  ADD COLUMN IF NOT EXISTS tagline      text,
  ADD COLUMN IF NOT EXISTS white_label  boolean NOT NULL DEFAULT false;


-- -----------------------------------------------------------------------------
-- 20260615120000_billing_notifications
-- -----------------------------------------------------------------------------
-- Billing notifications (Module 3 — Notification System).
--
-- Workspace-scoped, in-app billing events: subscription activation, renewal
-- reminders, payment success/failure, trial expiry, invoice availability, and
-- dunning/recovery notices. Emitted by the Razorpay webhook, the billing
-- scheduler (cron), and invoice generation. Surfaced on the owner Billing page.
--
-- `dedupe_key` makes cron-emitted notifications idempotent: a partial unique
-- index on (workspace_id, dedupe_key) means re-running a daily job (e.g. the
-- "renewal in 3 days" reminder for the same period) is a safe no-op.

CREATE TABLE IF NOT EXISTS public.billing_notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type         text        NOT NULL,
  severity     text        NOT NULL DEFAULT 'info',   -- info | success | warning | critical
  title        text        NOT NULL,
  body         text        NOT NULL DEFAULT '',
  action_url   text,
  dedupe_key   text,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_notifications_workspace_created_idx
  ON public.billing_notifications (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS billing_notifications_workspace_unread_idx
  ON public.billing_notifications (workspace_id)
  WHERE read_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_notifications_dedupe_idx
  ON public.billing_notifications (workspace_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 20260615140000_ai_assistant
-- -----------------------------------------------------------------------------
-- Module 6 — AI Personal Assistant Platform.
--
-- Three role-scoped assistants share one set of tables, distinguished by
-- `assistant_type` ('executive' | 'clinical' | 'wellness'):
--   executive → super admin (platform/business intelligence)
--   clinical  → workspace owner/nutritionist (practice operations)
--   wellness  → client (personal wellness companion)
--
-- Memory is isolated by (scope, scope_id) and never crosses a permission
-- boundary: business memory keys on the platform, workspace memory on the
-- workspace id, personal memory on the user id.

-- ── Conversations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    uuid        REFERENCES public.workspaces(id) ON DELETE CASCADE,
  assistant_type  text        NOT NULL,
  title           text        NOT NULL DEFAULT 'New conversation',
  last_message_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_conversations_user_idx
  ON public.assistant_conversations (user_id, assistant_type, last_message_at DESC NULLS LAST);

-- ── Messages ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  role            text        NOT NULL,                       -- 'user' | 'assistant' | 'system'
  content         text        NOT NULL,
  tokens          integer,
  latency_ms      integer,
  actions         jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- suggested actions on an assistant turn
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_messages_conversation_idx
  ON public.assistant_messages (conversation_id, created_at);

-- ── Memory (role-isolated) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_memory (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           text        NOT NULL,                       -- 'business' | 'workspace' | 'personal'
  scope_id        text        NOT NULL,                       -- platform marker | workspace_id | user_id
  assistant_type  text        NOT NULL,
  key             text        NOT NULL,
  value           text        NOT NULL,
  source          text        NOT NULL DEFAULT 'user',        -- 'user' | 'inferred'
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS assistant_memory_scope_key_idx
  ON public.assistant_memory (scope, scope_id, key);

-- ── Action audit trail ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_actions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        REFERENCES public.assistant_conversations(id) ON DELETE SET NULL,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    uuid        REFERENCES public.workspaces(id) ON DELETE CASCADE,
  assistant_type  text        NOT NULL,
  action_type     text        NOT NULL,
  status          text        NOT NULL,                       -- 'executed' | 'failed'
  params          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  result          jsonb,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_actions_user_idx
  ON public.assistant_actions (user_id, created_at DESC);


-- -----------------------------------------------------------------------------
-- 20260615160000_wellness_os
-- -----------------------------------------------------------------------------
-- Module 7 — Client Wellness Operating System.
--
-- The client portal already covers daily logs, measurements, achievements,
-- milestones, appointments, reports, supplements, cycle, photos and community.
-- This adds the missing wellness-OS primitives: structured GOALS, custom HABITS
-- with per-day check-ins (for streaks), and a personal JOURNAL. Everything is
-- scoped to a client (clients.id) and reached via the /me/* JWT pattern. The
-- unified Timeline is a read-only aggregation over existing tables (no table).

-- ── Goals ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wellness_goals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title         text        NOT NULL,
  description   text,
  category      text        NOT NULL DEFAULT 'lifestyle',   -- lifestyle|fitness|nutrition|habit|mindfulness|other
  target_value  numeric,
  current_value numeric     NOT NULL DEFAULT 0,
  unit          text,
  target_date   date,
  status        text        NOT NULL DEFAULT 'active',       -- active|achieved|archived
  achieved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wellness_goals_client_idx
  ON public.wellness_goals (client_id, status, created_at DESC);

-- ── Habits (master definitions) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wellness_habits (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title          text        NOT NULL,
  icon           text,
  color          text,
  cadence        text        NOT NULL DEFAULT 'daily',       -- daily|weekly
  target_per_day integer     NOT NULL DEFAULT 1,
  sort_order     integer     NOT NULL DEFAULT 0,
  active         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  archived_at    timestamptz
);
CREATE INDEX IF NOT EXISTS wellness_habits_client_idx
  ON public.wellness_habits (client_id, active, sort_order);

-- ── Habit check-ins (one row per habit per day completed) ────────────
CREATE TABLE IF NOT EXISTS public.wellness_habit_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id   uuid        NOT NULL REFERENCES public.wellness_habits(id) ON DELETE CASCADE,
  client_id  uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  log_date   date        NOT NULL,
  count      integer     NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS wellness_habit_logs_unique_idx
  ON public.wellness_habit_logs (habit_id, log_date);
CREATE INDEX IF NOT EXISTS wellness_habit_logs_client_date_idx
  ON public.wellness_habit_logs (client_id, log_date DESC);

-- ── Journal ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wellness_journal (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  entry_date    date        NOT NULL DEFAULT current_date,
  title         text,
  body          text        NOT NULL,
  mood          integer,                                     -- 1..5
  tags          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  ai_reflection text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wellness_journal_client_idx
  ON public.wellness_journal (client_id, entry_date DESC, created_at DESC);


-- -----------------------------------------------------------------------------
-- 20260615180000_program_engine
-- -----------------------------------------------------------------------------
-- Module 8 — Program Management Engine.
--
-- Reusable program TEMPLATES (workspace-owned) with TASKS, ASSIGNMENTS to
-- clients (which snapshot the template's tasks for versioning), and per-day
-- task completion logs (for compliance/progress). This is distinct from
-- weekly_plans (per-client meal plans) — a program coordinates activities,
-- habits, check-ins and nutrition tasks across a multi-week timeline.

-- ── Templates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.program_templates (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by     uuid,
  name           text        NOT NULL,
  description    text,
  category       text        NOT NULL DEFAULT 'custom',  -- weight_management|lifestyle|sports|clinical|corporate|custom
  duration_weeks integer     NOT NULL DEFAULT 4,
  goals          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  status         text        NOT NULL DEFAULT 'draft',   -- draft|published|archived
  version        integer     NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS program_templates_ws_idx
  ON public.program_templates (workspace_id, status, updated_at DESC);

-- ── Template tasks (the activities in a template) ────────────────────
CREATE TABLE IF NOT EXISTS public.program_template_tasks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid        NOT NULL REFERENCES public.program_templates(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  description text,
  type        text        NOT NULL DEFAULT 'task',       -- activity|nutrition|habit|task|checkin
  cadence     text        NOT NULL DEFAULT 'daily',       -- daily|weekly|once
  week_number integer,                                    -- for weekly/once scheduling
  day_of_week integer,                                    -- 0..6 (Sun..Sat), optional
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS program_template_tasks_idx
  ON public.program_template_tasks (template_id, sort_order);

-- ── Assignments (template → client; snapshots name/version) ──────────
CREATE TABLE IF NOT EXISTS public.program_assignments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      uuid        REFERENCES public.program_templates(id) ON DELETE SET NULL,
  workspace_id     uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id        uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  assigned_by      uuid,
  name             text        NOT NULL,
  category         text,
  duration_weeks   integer     NOT NULL DEFAULT 4,
  template_version integer     NOT NULL DEFAULT 1,
  start_date       date        NOT NULL DEFAULT current_date,
  end_date         date,
  status           text        NOT NULL DEFAULT 'active',  -- active|completed|paused|cancelled
  progress_pct     numeric     NOT NULL DEFAULT 0,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS program_assignments_ws_idx
  ON public.program_assignments (workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS program_assignments_client_idx
  ON public.program_assignments (client_id, status);

-- ── Assignment tasks (snapshot of template tasks at assign time) ─────
CREATE TABLE IF NOT EXISTS public.program_assignment_tasks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid        NOT NULL REFERENCES public.program_assignments(id) ON DELETE CASCADE,
  client_id     uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title         text        NOT NULL,
  description   text,
  type          text        NOT NULL DEFAULT 'task',
  cadence       text        NOT NULL DEFAULT 'daily',
  week_number   integer,
  day_of_week   integer,
  sort_order    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS program_assignment_tasks_idx
  ON public.program_assignment_tasks (assignment_id, sort_order);

-- ── Task completion logs (one row per task per completed day) ────────
CREATE TABLE IF NOT EXISTS public.program_task_logs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_task_id uuid        NOT NULL REFERENCES public.program_assignment_tasks(id) ON DELETE CASCADE,
  assignment_id      uuid        NOT NULL REFERENCES public.program_assignments(id) ON DELETE CASCADE,
  client_id          uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  log_date           date        NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS program_task_logs_unique_idx
  ON public.program_task_logs (assignment_task_id, log_date);
CREATE INDEX IF NOT EXISTS program_task_logs_assignment_idx
  ON public.program_task_logs (assignment_id, log_date DESC);


-- -----------------------------------------------------------------------------
-- 20260616100000_barcode_products
-- -----------------------------------------------------------------------------
-- Barcode scanning for fast packaged-food logging.
--
-- A first scan resolves a barcode against Open Food Facts; the result is cached
-- here so repeat scans are instant AND we build our OWN curated, label-accurate
-- product DB over time (the "accurate, not just big" differentiator). A
-- nutritionist can verify/correct an entry (`verified`), and nutrition values
-- are per-100g so any serving size can be computed.

CREATE TABLE IF NOT EXISTS public.barcode_products (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode        text        NOT NULL UNIQUE,
  name           text,
  brand          text,
  serving_size   text,
  image_url      text,
  kcal_100g      numeric,
  protein_100g   numeric,
  carb_100g      numeric,
  fat_100g       numeric,
  fiber_100g     numeric,
  sodium_mg_100g numeric,
  source         text        NOT NULL DEFAULT 'openfoodfacts',
  verified       boolean     NOT NULL DEFAULT false,
  raw            jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- 20260616120000_team_collaboration
-- -----------------------------------------------------------------------------
-- Module 9 — Communication & Collaboration Hub (team collaboration).
--
-- All existing messaging is client↔nutritionist (1:1). This adds the missing
-- INTERNAL team layer: workspace channels for multi-party staff chat, the
-- messages within them, and shared team notes (workflow coordination). Scoped
-- to a workspace; any staff member of that workspace participates.

-- ── Channels ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_channels (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  description  text,
  is_general   boolean     NOT NULL DEFAULT false,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_channels_ws_idx
  ON public.team_channels (workspace_id, created_at);

-- ── Channel messages (multi-party, staff only) ───────────────────────
CREATE TABLE IF NOT EXISTS public.team_messages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   uuid        NOT NULL REFERENCES public.team_channels(id) ON DELETE CASCADE,
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sender_id    uuid,
  content      text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_messages_channel_idx
  ON public.team_messages (channel_id, created_at);

-- ── Shared notes (team coordination) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_notes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title        text,
  body         text        NOT NULL,
  pinned       boolean     NOT NULL DEFAULT false,
  created_by   uuid,
  updated_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_notes_ws_idx
  ON public.team_notes (workspace_id, pinned DESC, updated_at DESC);


-- -----------------------------------------------------------------------------
-- 20260616140000_enterprise_ai
-- -----------------------------------------------------------------------------
-- Module 12 — Enterprise AI Ecosystem.
--
-- Ties the AI layer together with three NEW capabilities the prior AI modules
-- (6-11) didn't have:
--   ai_recommendations    — a persisted store for AI suggestions across the
--                           platform (previously recos were generated live and
--                           thrown away). Status: new | applied | dismissed.
--   ai_governance_actions — AI-proposed high-impact actions that require HUMAN
--                           approval before they execute (governance/control).
--   ai_feedback           — thumbs up/down + notes on AI outputs, the learning
--                           signal that lets human-verified data improve quality.

-- ── Recommendations store (AI Decision/Recommendation Engine) ─────────
CREATE TABLE IF NOT EXISTS public.ai_recommendations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scope        text        NOT NULL DEFAULT 'clinical',   -- business | clinical | wellness
  user_id      uuid,
  type         text        NOT NULL DEFAULT 'general',
  title        text        NOT NULL,
  body         text        NOT NULL DEFAULT '',
  severity     text        NOT NULL DEFAULT 'info',        -- info | opportunity | risk
  source       text        NOT NULL DEFAULT 'ai',
  status       text        NOT NULL DEFAULT 'new',         -- new | applied | dismissed
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_recommendations_ws_idx
  ON public.ai_recommendations (workspace_id, status, created_at DESC);

-- ── Governance queue (human approval of AI actions) ──────────────────
CREATE TABLE IF NOT EXISTS public.ai_governance_actions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  assistant_type text,
  proposed_by   text        NOT NULL DEFAULT 'ai',
  action_type   text        NOT NULL,
  title         text        NOT NULL,
  description   text,
  params        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status        text        NOT NULL DEFAULT 'pending',     -- pending | approved | rejected | executed | failed
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  review_note   text,
  result        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_governance_ws_idx
  ON public.ai_governance_actions (workspace_id, status, created_at DESC);

-- ── Feedback (learning signal) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_feedback (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id      uuid        NOT NULL,
  subject_type text        NOT NULL,                        -- message | recommendation | insight
  subject_id   uuid,
  rating       text        NOT NULL,                        -- up | down
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_feedback_subject_idx
  ON public.ai_feedback (user_id, subject_type, subject_id)
  WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_feedback_ws_idx
  ON public.ai_feedback (workspace_id, created_at DESC);


COMMIT;

-- Done. Verify with the post-checks in deploy/PROD_DEPLOY.md
