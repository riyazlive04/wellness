-- =============================================================================
-- Fine-grained permission overrides — Module 2 Permission Management
--
-- Workspace roles carry default permissions (code: auth/permissions.ts). This
-- table refines them PER MEMBER: grant a permission the role lacks, or deny one
-- it would normally have. Effective set = role defaults ± overrides, resolved
-- in JwtStrategy and attached to AuthUser.permissions.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_permission_overrides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission    text NOT NULL,
  effect        text NOT NULL CHECK (effect IN ('grant', 'deny')),
  set_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT workspace_permission_overrides_unique UNIQUE (workspace_id, user_id, permission)
);

CREATE INDEX IF NOT EXISTS workspace_permission_overrides_lookup_idx
  ON public.workspace_permission_overrides (workspace_id, user_id);

ALTER TABLE public.workspace_permission_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own overrides" ON public.workspace_permission_overrides;
CREATE POLICY "Members read own overrides"
  ON public.workspace_permission_overrides FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
       WHERE wm.workspace_id = workspace_permission_overrides.workspace_id
         AND wm.user_id = auth.uid()
         AND wm.role = 'owner'
         AND wm.status = 'active'
    )
  );

COMMENT ON TABLE public.workspace_permission_overrides IS
  'Per-member grant/deny refinements over role-default permissions.';
