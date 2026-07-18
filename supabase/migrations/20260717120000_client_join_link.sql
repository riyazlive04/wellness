-- ============================================================================
-- SIRAH LIFE — Self-service client join link.
--
-- Replaces per-email client invites (client_invites) with one shareable,
-- expiring link per workspace plus an approval queue.
--
-- Flow:
--   1. Owner reads/rotates their link: GET|POST /workspaces/me/join-link
--      → workspaces.join_token (+ expiry)
--   2. Prospect opens https://app/join/<token>
--      → backend GET /join/<token> returns workspace name (no auth, validates
--        token + expiry)
--   3. Prospect signs up via Supabase Auth (name/email/password) on that page
--   4. Prospect POSTs /join/<token>/request with their bearer
--      → user_roles += 'client'; clients row at status='pending';
--        client_join_requests row at status='pending'
--      → UNLESS their email is pre-approved (client_preapprovals), in which
--        case they land straight at status='active'
--   5. Owner approves/rejects in the roster
--      → clients.status='active' (plan limit enforced HERE, not at request
--        time, so pending requests can't consume seats)
-- ============================================================================

-- ── 1. Workspace join link ──────────────────────────────────────────────────
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS join_token            text,
  ADD COLUMN IF NOT EXISTS join_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS join_token_created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS join_token_created_at timestamptz;

-- Partial unique: many workspaces may have no link yet (NULL), but a live
-- token must resolve to exactly one workspace.
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_join_token_key
  ON public.workspaces(join_token)
  WHERE join_token IS NOT NULL;

COMMENT ON COLUMN public.workspaces.join_token IS
  'Random 32-byte hex token behind /join/<token>. NULL until first generated; rotating replaces it and instantly kills the old link.';

-- ── 2. Join requests ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_join_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- The auth user who signed up via the link. Always present: a request can
  -- only be made with a bearer token.
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text NOT NULL,
  name          text,
  -- Status: pending → approved | rejected
  status        text NOT NULL DEFAULT 'pending',
  note          text,
  decided_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_join_requests_workspace_idx ON public.client_join_requests(workspace_id);
CREATE INDEX IF NOT EXISTS client_join_requests_status_idx    ON public.client_join_requests(workspace_id, status);
CREATE INDEX IF NOT EXISTS client_join_requests_user_idx      ON public.client_join_requests(user_id);

-- One live request per person per workspace — re-submitting is a no-op rather
-- than a way to spam the owner's queue.
CREATE UNIQUE INDEX IF NOT EXISTS client_join_requests_unique_pending
  ON public.client_join_requests(workspace_id, user_id)
  WHERE status = 'pending';

COMMENT ON TABLE public.client_join_requests IS
  'Self-service join requests from the workspace join link. Owner approves → clients.status active.';

-- ── 3. Pre-approved emails (CSV import target) ──────────────────────────────
-- Deliberately NOT clients rows: clients.user_id is NOT NULL, and a person we
-- have merely imported has no auth user yet. Consumed on first matching signup.
CREATE TABLE IF NOT EXISTS public.client_preapprovals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email           text NOT NULL,
  name            text,
  phone           text,
  note            text,
  added_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  consumed_at     timestamptz,
  consumed_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_preapprovals_workspace_idx ON public.client_preapprovals(workspace_id);

-- Idempotent import: re-running the same CSV must not duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS client_preapprovals_unique_email
  ON public.client_preapprovals(workspace_id, lower(email));

COMMENT ON TABLE public.client_preapprovals IS
  'Emails imported by the owner. A join request from a matching email is auto-approved instead of queued.';

-- ── 4. updated_at triggers ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'client_join_requests_set_updated_at') THEN
    CREATE TRIGGER client_join_requests_set_updated_at
      BEFORE UPDATE ON public.client_join_requests
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'client_preapprovals_set_updated_at') THEN
    CREATE TRIGGER client_preapprovals_set_updated_at
      BEFORE UPDATE ON public.client_preapprovals
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── 5. RLS ──────────────────────────────────────────────────────────────────
-- service_role bypass only, matching client_invites: the join token is a
-- secret, so preview/request must go through the backend which validates
-- expiry and status before responding. No anon policies on purpose.
ALTER TABLE public.client_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_preapprovals  ENABLE ROW LEVEL SECURITY;
