-- The real device model behind a login session.
--
-- This table already exists on production, created by hand when the sessions
-- list was built; it was never captured as a migration, so a fresh
-- environment came up without it and the sessions list silently fell back to
-- "Android phone" for every mobile row. IF NOT EXISTS makes this safe to run
-- against the live database, which is why it is written that way rather than
-- as a plain CREATE.
--
-- One row per auth.sessions row. The model comes from User-Agent Client
-- Hints, which the browser only exposes on request - the UA string itself no
-- longer carries it.
CREATE TABLE IF NOT EXISTS public.session_devices (
  session_id       uuid PRIMARY KEY,
  user_id          uuid NOT NULL,
  model            text,
  platform         text,
  platform_version text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Looking up every device a user has, for the sessions list and the device
-- limit check.
CREATE INDEX IF NOT EXISTS session_devices_user_idx
  ON public.session_devices (user_id);

-- No FK to auth.sessions: Supabase deletes session rows on sign-out and token
-- rotation without touching this table, and a cascade from the auth schema is
-- not ours to add. Orphans are harmless - every read joins FROM auth.sessions,
-- so a row with no session is simply never seen.
COMMENT ON TABLE public.session_devices IS
  'Device model per auth.sessions row, captured via User-Agent Client Hints.';
