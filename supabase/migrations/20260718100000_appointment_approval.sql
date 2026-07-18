-- =============================================================================
-- Appointment approval flow
--
-- When a CLIENT books, the appointment is now a *request* that the nutritionist
-- must approve before it becomes a confirmed session. Nutritionist-created
-- appointments are still born 'scheduled' (the coach is the approver).
--
--   client requests  ->  status = 'pending'
--   nutritionist approves -> status = 'scheduled'  (+ approved_at / approved_by)
--   nutritionist declines  -> status = 'declined'  (+ cancel_reason)
--
-- Additive + idempotent so it can be re-run safely against prod.
-- =============================================================================

-- Widen the status CHECK to allow 'pending' (awaiting approval) and 'declined'.
-- The original inline column CHECK is auto-named "appointments_status_check".
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'scheduled', 'completed', 'cancelled', 'no_show', 'declined'));

-- Audit: who approved the request and when (null until approved).
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS approved_by uuid
  REFERENCES auth.users(id) ON DELETE SET NULL;

-- Hot path for the nutritionist's "pending requests" panel.
CREATE INDEX IF NOT EXISTS appointments_pending_idx
  ON public.appointments (workspace_id, scheduled_at)
  WHERE status = 'pending';
