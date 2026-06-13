-- =============================================================================
-- Workspace (staff) invitations — Module 2 Team Management + Invitation System
--
-- client_invites onboards CLIENTS. This table onboards TEAM members: a token
-- invite carrying the workspace_member_role to grant on accept. Mirrors the
-- client_invites shape so the flows feel identical.
--
-- Team-size limits (LimitsService) count active workspace_members + pending
-- rows here, so an invite consumes a seat the moment it's issued.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_invites (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email            text NOT NULL,
  role             public.workspace_member_role NOT NULL DEFAULT 'nutritionist',
  token            text NOT NULL UNIQUE,
  invited_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  accepted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at      timestamptz,
  revoked_at       timestamptz,
  revoked_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- One outstanding pending invite per email per workspace.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_invites_pending_email_key
  ON public.workspace_invites (workspace_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS workspace_invites_workspace_idx
  ON public.workspace_invites (workspace_id, status);

-- RLS — backend writes use the service connection (bypasses RLS); this lets a
-- workspace member read their workspace's invites directly if ever needed.
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members read team invites" ON public.workspace_invites;
CREATE POLICY "Workspace members read team invites"
  ON public.workspace_invites FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
     WHERE wm.workspace_id = workspace_invites.workspace_id
       AND wm.user_id = auth.uid()
       AND wm.status = 'active'
  ));

COMMENT ON TABLE public.workspace_invites IS
  'Token-based staff/team invitations. On accept, a workspace_members row is created with the invite role.';
