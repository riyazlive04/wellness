-- =============================================================================
-- Active workspace preference — Module 2 Workspace Switching + Impersonation
--
-- A user may belong to several workspaces (team member of multiple practices,
-- org admin across clinics). JwtStrategy defaults to the OLDEST active
-- membership; this table lets a user pin a different one as "active".
--
-- Super admins additionally use it to IMPERSONATE a workspace (is_impersonation
-- = true) — pinning a workspace they aren't a member of so tenant-scoped reads
-- resolve to that tenant. Every impersonation start/stop is written to
-- activity_logs for an auditable trail.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_workspace_preference (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  is_impersonation boolean NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_workspace_preference_ws_idx
  ON public.user_workspace_preference (workspace_id);

ALTER TABLE public.user_workspace_preference ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own active workspace" ON public.user_workspace_preference;
CREATE POLICY "Users manage own active workspace"
  ON public.user_workspace_preference FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.user_workspace_preference IS
  'Per-user pinned active workspace. is_impersonation marks a super-admin acting as a workspace they do not belong to.';
