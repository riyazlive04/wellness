-- Add onboarded_at timestamp to clients so the portal can gate /portal/*
-- behind a wellness-profile wizard for first-time invitees.
--
-- NULL = wizard pending (force redirect). Non-null = completed (let through).
-- We set this once on POST /api/v1/me/onboarding/complete and never clear it.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

COMMENT ON COLUMN public.clients.onboarded_at IS
  'When the client completed the post-invite wellness onboarding wizard. NULL = pending.';

-- Backfill existing rows so historical clients aren't forced through the
-- wizard. Anyone whose row has age + goals set has already provided enough
-- profile context — treat them as onboarded.
UPDATE public.clients
   SET onboarded_at = COALESCE(updated_at, created_at)
 WHERE onboarded_at IS NULL
   AND (age IS NOT NULL OR goals IS NOT NULL);