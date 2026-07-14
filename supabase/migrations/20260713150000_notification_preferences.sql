-- Per-user notification preferences — powers the owner "Notifications" settings
-- page (channels, per-event matrix, quiet hours). One row per auth user; the
-- blobs mirror the front-end shape so the whole preference set round-trips as-is.
--
-- Enforcement (see NotificationPreferencesService): a MISSING row, a missing
-- channel key, or a missing event entry all mean "deliver" — so existing users
-- with no saved preferences keep receiving everything exactly as before.

create table if not exists public.notification_preferences (
  user_id           uuid primary key,
  -- STAFF prefs ─────────────────────────────────────────────────────
  -- master per-channel on/off, e.g. {"email":true,"push":false,"whatsapp":true,"inapp":true}
  channels          jsonb   not null default '{}'::jsonb,
  -- per-event channel matrix, e.g. {"new_client_message":{"push":true,"inapp":true,...}}
  events            jsonb   not null default '{}'::jsonb,
  -- {"enabled":true,"startHour":22,"endHour":7,"days":[0,1,2,3,4,5,6]}
  quiet_hours       jsonb   not null default '{}'::jsonb,
  -- browser UTC offset in minutes (e.g. IST = 330), so quiet hours resolve in the
  -- user's local wall-clock rather than the server's UTC. Null → quiet hours off.
  tz_offset_minutes integer,
  -- CLIENT prefs ────────────────────────────────────────────────────
  -- client-portal category toggles (all-or-nothing per category, no channel
  -- split), e.g. {"meal":true,"water":false,"appt":true,"program":true,"ai_nudge":true}
  client_categories jsonb   not null default '{}'::jsonb,
  updated_at        timestamptz not null default now()
);

-- Idempotent add for environments where the table already exists from an
-- earlier run of this migration without the client column.
alter table public.notification_preferences
  add column if not exists client_categories jsonb not null default '{}'::jsonb;

-- Backend reads/writes these via the postgres role (bypasses RLS); enable RLS so
-- the anon/authenticated Supabase keys can never touch them directly.
alter table public.notification_preferences enable row level security;
