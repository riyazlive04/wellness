-- Daily forms: an assessment form the client fills in EVERY DAY, with the
-- answers stored so they can be charted over time.
--
-- Two things are missing from the one-off assessment flow and added here:
--
--   1. Recurrence. A form was sent one card at a time, by hand. A daily log
--      needs to open itself each morning, so `repeat_daily` + `reminder_time`
--      live on the template and `daily_form_entries` holds one row per client
--      per day (unique on client_id + entry_date, so saving twice updates).
--
--   2. Charting. Answers lived only in pending_review_cards.generated_content
--      as one JSON blob per card, which cannot answer "fasting glucose over
--      the last 30 days". `daily_form_values` stores each numeric answer as
--      its own row, modelled on client_lab_results.
--
-- The text answers stay in the entry's JSON; only numbers are expanded into
-- daily_form_values, because only numbers get charted.

-- ── 1. Recurrence settings on the form definition ────────────────────
alter table public.assessment_form_templates
  add column if not exists repeat_daily   boolean     not null default false,
  -- Local time to nudge the client, e.g. '20:00'. NULL = no reminder.
  add column if not exists reminder_time  time,
  -- Clients this daily form is assigned to. Empty = assigned to nobody yet.
  add column if not exists assigned_client_ids uuid[] not null default '{}';

comment on column public.assessment_form_templates.repeat_daily is
  'Daily log rather than a one-off form: clients get a fresh entry each day.';

create index if not exists assessment_form_templates_daily_idx
  on public.assessment_form_templates (workspace_id)
  where repeat_daily = true and archived = false;

-- ── 2. One entry per client per day ──────────────────────────────────
create table if not exists public.daily_form_entries (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.assessment_form_templates(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- The client's local date, not UTC: a 11pm log belongs to that day.
  entry_date   date not null,
  -- { question_id: answer } exactly as the client portal submits it.
  responses    jsonb not null default '{}',
  -- How many of the form's answerable fields were filled, for "8 of 24".
  filled_count integer not null default 0,
  field_count  integer not null default 0,
  submitted_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Re-saving the same day updates rather than inserting a duplicate.
  unique (template_id, client_id, entry_date)
);

create index if not exists daily_form_entries_client_date_idx
  on public.daily_form_entries (client_id, entry_date desc);
create index if not exists daily_form_entries_ws_date_idx
  on public.daily_form_entries (workspace_id, entry_date desc);

-- ── 3. One row per numeric answer, for charts ────────────────────────
create table if not exists public.daily_form_values (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.daily_form_entries(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  template_id uuid not null references public.assessment_form_templates(id) on delete cascade,
  -- The question's id within the form, e.g. 'glucose_fasting'.
  field_id    text not null,
  entry_date  date not null,
  value       numeric not null,
  -- Snapshot of the label and unit at the time, so renaming a question later
  -- does not rewrite history.
  label       text,
  unit        text,
  -- Rewritten wholesale whenever the entry is saved.
  unique (entry_id, field_id)
);

create index if not exists daily_form_values_chart_idx
  on public.daily_form_values (client_id, field_id, entry_date desc);

-- Backend reads and writes as the postgres role (bypasses RLS); enable it so
-- the anon/authenticated keys cannot read another client's health data.
alter table public.daily_form_entries enable row level security;
alter table public.daily_form_values  enable row level security;
