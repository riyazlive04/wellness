-- =============================================================================
-- Body measurements tracker
--
-- The legacy ClientMeasurementTracker.tsx expects this table but it was never
-- migrated — the component gracefully handles the missing table. We add it
-- now so the SIRAH client portal can show inches lost over time, which is
-- a higher-signal metric than weight for clients in active weight loss.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.client_measurements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  arm_inches    numeric(5, 2),
  chest_inches  numeric(5, 2),
  waist_inches  numeric(5, 2),
  hip_inches    numeric(5, 2),
  thigh_inches  numeric(5, 2),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_measurements_client_recorded_idx
  ON public.client_measurements (client_id, recorded_at DESC);

ALTER TABLE public.client_measurements ENABLE ROW LEVEL SECURITY;

-- Client can see + insert their own measurements.
DROP POLICY IF EXISTS "measurements_client_self" ON public.client_measurements;
CREATE POLICY "measurements_client_self"
  ON public.client_measurements
  FOR ALL TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()))
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

-- Workspace members can see all measurements in their workspace.
DROP POLICY IF EXISTS "measurements_workspace_member" ON public.client_measurements;
CREATE POLICY "measurements_workspace_member"
  ON public.client_measurements
  FOR ALL TO authenticated
  USING (
    client_id IN (
      SELECT c.id FROM public.clients c
        JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
       WHERE wm.user_id = auth.uid() AND wm.status = 'active'
    )
  );