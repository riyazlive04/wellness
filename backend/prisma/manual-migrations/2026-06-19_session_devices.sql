-- Real device model per login session, captured client-side via User-Agent
-- Client Hints (navigator.userAgentData.getHighEntropyValues) because modern
-- browsers strip the model from the User-Agent string ("Android 10; K").
-- Keyed by Supabase auth.sessions.id; auto-cleaned when the session is revoked.
CREATE TABLE IF NOT EXISTS public.session_devices (
  session_id        uuid PRIMARY KEY
                      REFERENCES auth.sessions(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL,
  model             text,
  platform          text,
  platform_version  text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_devices_user ON public.session_devices(user_id);
