-- =============================================================================
-- Wave 1 — engagement + India-specific features
--
-- One migration creates everything for this batch so the user only needs to
-- run a single block in the SQL Editor. Each section is idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Mood + energy daily — attached to daily_logs so it lives next to habits
-- ---------------------------------------------------------------------------

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS mood         smallint CHECK (mood IS NULL OR mood BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS energy       smallint CHECK (energy IS NULL OR energy BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS mood_notes   text;

-- ---------------------------------------------------------------------------
-- 2. Period / cycle tracker
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cycle_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type    text NOT NULL CHECK (event_type IN ('period_start', 'period_end', 'ovulation', 'pms', 'cramps', 'spotting')),
  event_date    date NOT NULL,
  flow_level    smallint CHECK (flow_level IS NULL OR flow_level BETWEEN 0 AND 3),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cycle_events_client_date_idx
  ON public.cycle_events (client_id, event_date DESC);

ALTER TABLE public.cycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cycle_events_client_self" ON public.cycle_events;
CREATE POLICY "cycle_events_client_self"
  ON public.cycle_events FOR ALL TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()))
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "cycle_events_workspace_member" ON public.cycle_events;
CREATE POLICY "cycle_events_workspace_member"
  ON public.cycle_events FOR SELECT TO authenticated
  USING (client_id IN (
    SELECT c.id FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
     WHERE wm.user_id = auth.uid() AND wm.status = 'active'
  ));

-- ---------------------------------------------------------------------------
-- 3. Photo progress journal — backed by Supabase storage bucket
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.progress_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  taken_at      timestamptz NOT NULL DEFAULT now(),
  -- 'front' | 'side' | 'back' — keeps comparison sliders aligned to the
  -- same angle over time. NULL allowed for ad-hoc snapshots.
  angle         text CHECK (angle IS NULL OR angle IN ('front', 'side', 'back')),
  -- Storage object key inside the progress-photos bucket.
  storage_key   text NOT NULL,
  -- Snapshot of weight at the time of the photo for the comparison overlay.
  weight_kg     numeric(5, 2),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS progress_photos_client_idx
  ON public.progress_photos (client_id, taken_at DESC);

ALTER TABLE public.progress_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "progress_photos_client_self" ON public.progress_photos;
CREATE POLICY "progress_photos_client_self"
  ON public.progress_photos FOR ALL TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()))
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "progress_photos_workspace_member" ON public.progress_photos;
CREATE POLICY "progress_photos_workspace_member"
  ON public.progress_photos FOR SELECT TO authenticated
  USING (client_id IN (
    SELECT c.id FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
     WHERE wm.user_id = auth.uid() AND wm.status = 'active'
  ));

-- ---------------------------------------------------------------------------
-- 4. Symptom tracker
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.symptom_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  -- Common symptoms get a string code so we can do pattern detection later.
  -- Free-text notes are always allowed.
  symptom       text NOT NULL,
  severity      smallint NOT NULL DEFAULT 2 CHECK (severity BETWEEN 1 AND 5),
  notes         text,
  -- Optional tag of what the user thinks triggered it (food, stress, etc.)
  suspected_trigger text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS symptom_logs_client_idx
  ON public.symptom_logs (client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS symptom_logs_symptom_idx
  ON public.symptom_logs (client_id, symptom);

ALTER TABLE public.symptom_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "symptom_logs_client_self" ON public.symptom_logs;
CREATE POLICY "symptom_logs_client_self"
  ON public.symptom_logs FOR ALL TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()))
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "symptom_logs_workspace_member" ON public.symptom_logs;
CREATE POLICY "symptom_logs_workspace_member"
  ON public.symptom_logs FOR SELECT TO authenticated
  USING (client_id IN (
    SELECT c.id FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
     WHERE wm.user_id = auth.uid() AND wm.status = 'active'
  ));

-- ---------------------------------------------------------------------------
-- 5. Goal milestones — fires when client crosses kg/cm/streak thresholds
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.client_milestones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  -- 'weight_lost_kg' | 'waist_lost_cm' | 'streak_days' | 'water_goal_days' | 'goal_reached'
  kind          text NOT NULL,
  -- The threshold value crossed (e.g., 5 for "5kg lost"). NULL for goal_reached.
  value         numeric(8, 2),
  achieved_at   timestamptz NOT NULL DEFAULT now(),
  -- One-time toggle — flips to true after the client dismisses the celebration.
  celebrated    boolean NOT NULL DEFAULT false,
  message       text,
  UNIQUE (client_id, kind, value)
);
CREATE INDEX IF NOT EXISTS client_milestones_client_idx
  ON public.client_milestones (client_id, achieved_at DESC);

ALTER TABLE public.client_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_milestones_client_self" ON public.client_milestones;
CREATE POLICY "client_milestones_client_self"
  ON public.client_milestones FOR ALL TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()))
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "client_milestones_workspace_member" ON public.client_milestones;
CREATE POLICY "client_milestones_workspace_member"
  ON public.client_milestones FOR SELECT TO authenticated
  USING (client_id IN (
    SELECT c.id FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
     WHERE wm.user_id = auth.uid() AND wm.status = 'active'
  ));

-- ---------------------------------------------------------------------------
-- 6. Supplements + medication tracker
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.client_supplements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name          text NOT NULL,
  dosage        text,
  -- 'morning' | 'noon' | 'evening' | 'night' | 'with_meal'
  schedule      text[] NOT NULL DEFAULT '{}'::text[],
  active        boolean NOT NULL DEFAULT true,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_supplements_client_idx
  ON public.client_supplements (client_id, active);

CREATE TABLE IF NOT EXISTS public.supplement_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplement_id uuid NOT NULL REFERENCES public.client_supplements(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  taken_at      timestamptz NOT NULL DEFAULT now(),
  slot          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplement_logs_client_idx
  ON public.supplement_logs (client_id, taken_at DESC);

ALTER TABLE public.client_supplements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplement_logs   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplements_client_self" ON public.client_supplements;
CREATE POLICY "supplements_client_self"
  ON public.client_supplements FOR ALL TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()))
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "supplements_workspace_member" ON public.client_supplements;
CREATE POLICY "supplements_workspace_member"
  ON public.client_supplements FOR ALL TO authenticated
  USING (client_id IN (
    SELECT c.id FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
     WHERE wm.user_id = auth.uid() AND wm.status = 'active'
  ));

DROP POLICY IF EXISTS "supplement_logs_client_self" ON public.supplement_logs;
CREATE POLICY "supplement_logs_client_self"
  ON public.supplement_logs FOR ALL TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()))
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "supplement_logs_workspace_member" ON public.supplement_logs;
CREATE POLICY "supplement_logs_workspace_member"
  ON public.supplement_logs FOR SELECT TO authenticated
  USING (client_id IN (
    SELECT c.id FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
     WHERE wm.user_id = auth.uid() AND wm.status = 'active'
  ));

-- ---------------------------------------------------------------------------
-- 7. Regional cuisine — single column on recipes for filter
-- ---------------------------------------------------------------------------

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS cuisine text;

CREATE INDEX IF NOT EXISTS recipes_cuisine_idx
  ON public.recipes (cuisine) WHERE cuisine IS NOT NULL;