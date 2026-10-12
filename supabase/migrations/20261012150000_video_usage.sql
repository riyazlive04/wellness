-- Video call minutes per practice, for the monthly video allowance on each plan.
-- A call is counted once, at its booked length, the first time anyone joins it;
-- re-joining the same appointment is free. Deleting the appointment keeps the
-- row (appointment_id goes null) so minutes can't be won back that way.

CREATE TABLE IF NOT EXISTS public.video_usage (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  appointment_id uuid UNIQUE REFERENCES public.appointments(id) ON DELETE SET NULL,
  minutes        integer NOT NULL CHECK (minutes > 0),
  charged_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_usage_workspace_charged_idx
  ON public.video_usage (workspace_id, charged_at);

-- Server-side only (the API writes and reads it); no client policies.
ALTER TABLE public.video_usage ENABLE ROW LEVEL SECURITY;
