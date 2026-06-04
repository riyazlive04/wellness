-- ============================================================================
-- SIRAH LIFE — Client invites bridge.
--
-- Workspace admin (a nutritionist) issues an invite. The invite token is what
-- the prospective client uses to claim a /portal account in this workspace.
--
-- Flow:
--   1. Admin POSTs /workspaces/me/clients/invite {email}
--      → row inserted, token returned, share-link sent to client out-of-band
--   2. Client opens https://app/invite/<token>
--      → backend GET /invites/<token> returns workspace name (no auth)
--   3. Client signs up / signs in via Supabase Auth
--   4. Client POSTs /invites/<token>/accept with their bearer
--      → user_roles += 'client'; clients(workspace_id, user_id) row;
--        invite.status='accepted'
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.client_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email           text NOT NULL,
  name            text,
  -- Random 32-byte token, hex-encoded → 64 chars. Sent in the URL.
  token           text NOT NULL UNIQUE,
  invited_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Status: pending → accepted | revoked | expired
  status          text NOT NULL DEFAULT 'pending',
  accepted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  revoked_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Default 14-day TTL, can be tightened.
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_invites_workspace_idx ON public.client_invites(workspace_id);
CREATE INDEX IF NOT EXISTS client_invites_status_idx    ON public.client_invites(status);
CREATE INDEX IF NOT EXISTS client_invites_expires_idx   ON public.client_invites(expires_at);
-- Unique pending invite per (workspace, email) so admins can't accidentally
-- issue two parallel invites for the same person.
CREATE UNIQUE INDEX IF NOT EXISTS client_invites_unique_pending
  ON public.client_invites(workspace_id, lower(email))
  WHERE status = 'pending';

COMMENT ON TABLE public.client_invites IS
  'Bridge between a workspace and a future auth.users client. Token-gated, 14d default TTL.';

-- Self-contained: re-declare set_updated_at so this migration runs even if
-- 20260603120000_add_billing_tables.sql hasn't been applied yet. CREATE OR
-- REPLACE is a no-op when the function already matches.
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
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'client_invites_set_updated_at') THEN
    CREATE TRIGGER client_invites_set_updated_at
      BEFORE UPDATE ON public.client_invites
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.client_invites ENABLE ROW LEVEL SECURITY;
-- service_role bypass (backend reads/writes). Tokens are short-lived secrets
-- so we intentionally have no anon SELECT policy — invite preview must go
-- through the backend, which validates expiry + status before responding.