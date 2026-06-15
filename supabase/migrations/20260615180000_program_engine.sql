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
