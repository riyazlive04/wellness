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
