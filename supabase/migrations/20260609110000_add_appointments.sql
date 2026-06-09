-- =============================================================================
-- Phase 3 — Appointments
--
-- Replaces the in-page placeholder on /portal/appointments with a real booking
-- flow. The legacy Sheizen platform tracked appointments inside `messages` as
-- 'manual' rows; we promote them to a first-class entity so:
--   - frontend can list/cancel without parsing message metadata
--   - nutritionist UI can see them on their calendar (next session)
--   - reminders (email/push 24h + 1h before) can join on a single table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.appointments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_id      uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Optional: a specific nutritionist on the workspace. Many practices have
  -- only one, but multi-coach clinics need to bind the appointment to one.
  nutritionist_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  scheduled_at      timestamptz NOT NULL,
  duration_minutes  smallint NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 15 AND 240),

  kind              text NOT NULL CHECK (kind IN ('consultation', 'follow_up', 'check_in', 'assessment', 'group_session')),
  mode              text NOT NULL DEFAULT 'video' CHECK (mode IN ('video', 'phone', 'in_person')),
  status            text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),

  meeting_url       text,
  location          text,
  notes             text,
  cancelled_at      timestamptz,
  cancelled_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancel_reason     text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Most common access patterns
CREATE INDEX IF NOT EXISTS appointments_client_scheduled_idx
  ON public.appointments (client_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS appointments_workspace_scheduled_idx
  ON public.appointments (workspace_id, scheduled_at DESC);

-- Upcoming-by-status (cheap partial index, hot lookup for both portals)
CREATE INDEX IF NOT EXISTS appointments_upcoming_idx
  ON public.appointments (workspace_id, scheduled_at)
  WHERE status = 'scheduled';

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Clients can see + cancel their own.
DROP POLICY IF EXISTS "appointments_client_self" ON public.appointments;
CREATE POLICY "appointments_client_self"
  ON public.appointments
  FOR ALL
  TO authenticated
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  )
  WITH CHECK (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  );

-- Workspace members can see all appointments in their workspace.
DROP POLICY IF EXISTS "appointments_workspace_member" ON public.appointments;
CREATE POLICY "appointments_workspace_member"
  ON public.appointments
  FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
       WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Reuse the existing set_updated_at trigger so updated_at stays fresh.
DROP TRIGGER IF EXISTS appointments_set_updated_at ON public.appointments;
CREATE TRIGGER appointments_set_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();