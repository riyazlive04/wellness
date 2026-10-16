-- Daily exercise tracking: a client logs what they did, with photos, and
-- their practice sees it.
--
-- Why a new table rather than daily_logs.activity_minutes: that column holds
-- one integer per day and nothing else. An exercise entry needs a name, the
-- time it actually happened (separate from when it was submitted), optional
-- notes, photos, and several entries per day — a morning walk and an evening
-- gym session are two entries, not one number.
--
-- Photos reuse the existing progress-photos pipeline: the client gets a
-- signed upload ticket, PUTs the bytes straight to Supabase storage, and we
-- store only the object key. Nothing is ever base64 in a column.

CREATE TABLE IF NOT EXISTS public.exercise_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id)    ON DELETE CASCADE,
  -- Denormalised so the practice-wide feed doesn't join clients on every row.
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- What they did, in their own words: 'Morning walk', 'Leg day'.
  name          text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 120),
  -- Coarse bucket for filtering. Free text, not an enum: practices invent
  -- their own ('kalari', 'sword fighting') and a CHECK would reject them.
  kind          text CHECK (kind IS NULL OR length(kind) <= 40),

  -- When the exercise happened, in the client's local day. Kept apart from
  -- submitted_at so a workout logged the next morning still counts for the
  -- day it was done.
  performed_on  date NOT NULL,
  performed_at  time,
  duration_min  integer CHECK (duration_min IS NULL OR (duration_min > 0 AND duration_min <= 1440)),
  notes         text CHECK (notes IS NULL OR length(notes) <= 2000),

  -- When they actually pressed save. Never equal to performed_at by
  -- construction, so back-filled entries are visible as such.
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- The two hot reads: one client's history, and the practice-wide feed.
CREATE INDEX IF NOT EXISTS exercise_logs_client_idx
  ON public.exercise_logs (client_id, performed_on DESC, performed_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS exercise_logs_workspace_idx
  ON public.exercise_logs (workspace_id, performed_on DESC, submitted_at DESC);

-- Photos for an entry. A separate table because one session can have several
-- (before/after, the treadmill screen, the route map).
CREATE TABLE IF NOT EXISTS public.exercise_log_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id      uuid NOT NULL REFERENCES public.exercise_logs(id) ON DELETE CASCADE,
  -- Carried so a photo can be authorised without joining back to the log.
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  -- Object key inside the progress-photos bucket, same convention as
  -- progress_photos: '{client_id}/{timestamp}-{random}-{filename}'.
  storage_key text NOT NULL,
  -- Client-reported, for the storage breakdown. Not trusted for limits.
  bytes       integer,
  sort_order  smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exercise_log_photos_log_idx
  ON public.exercise_log_photos (log_id, sort_order);

-- Same shape as progress_photos: the client owns their rows, and any active
-- member of their practice may read them. The backend connects as postgres
-- and bypasses RLS; these policies guard the anon/authenticated keys.
ALTER TABLE public.exercise_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_log_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exercise_logs_client_self" ON public.exercise_logs;
CREATE POLICY "exercise_logs_client_self"
  ON public.exercise_logs FOR ALL TO authenticated
  USING      (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()))
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "exercise_logs_workspace_member" ON public.exercise_logs;
CREATE POLICY "exercise_logs_workspace_member"
  ON public.exercise_logs FOR SELECT TO authenticated
  USING (client_id IN (
    SELECT c.id FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
     WHERE wm.user_id = auth.uid() AND wm.status = 'active'
  ));

DROP POLICY IF EXISTS "exercise_log_photos_client_self" ON public.exercise_log_photos;
CREATE POLICY "exercise_log_photos_client_self"
  ON public.exercise_log_photos FOR ALL TO authenticated
  USING      (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()))
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "exercise_log_photos_workspace_member" ON public.exercise_log_photos;
CREATE POLICY "exercise_log_photos_workspace_member"
  ON public.exercise_log_photos FOR SELECT TO authenticated
  USING (client_id IN (
    SELECT c.id FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
     WHERE wm.user_id = auth.uid() AND wm.status = 'active'
  ));

-- ── The progress-photos bucket ───────────────────────────────────────
-- It was created by hand in the Supabase dashboard and exists in no
-- migration, so a database rebuilt from scratch would have photo uploads
-- fail silently. Declare it here, and give it the size and type limits it
-- never had: uploads go straight from the phone to storage with a signed
-- URL, so the bucket is the ONLY place these can be enforced.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('progress-photos', 'progress-photos', false, 15728640,  -- 15 MB, matching the avatar upload cap
        ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
