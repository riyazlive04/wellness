-- Phase 2 of role-based access: assign a client to a specific coach so that
-- coaches see only their own caseload. Owners/nutritionists see everyone.
-- Nullable; ON DELETE SET NULL so removing a staff user just unassigns.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS assigned_coach_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_assigned_coach
  ON public.clients(assigned_coach_user_id);
