-- =============================================================================
-- Organization Layer  (Platform → Organization → Workspace → User)
--
-- Adds a parent tier above workspaces for clinic chains, franchise groups,
-- and health networks. Backward-compatible — every existing workspace
-- continues to function with organization_id = NULL ("solo" workspace).
--
-- Tables:
--   public.organizations          — chain / franchise / network record
--   public.organization_members   — users + their role inside the org
--
-- Changes:
--   public.workspaces   + organization_id  (nullable; FK to organizations)
--   public.activity_logs + organization_id (nullable; FK)
--
-- Roles (org_*):
--   org_owner   — full control: settings, billing, workspace mgmt, members
--   org_admin   — same minus destructive org-level ops (delete, billing)
--   org_viewer  — read-only across all org workspaces
--
-- An org_owner of org X is treated as workspace-owner for any workspace
-- inside X. This widening lives in the WorkspaceRole guard at the app layer.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  name                text NOT NULL,
  slug                text NOT NULL UNIQUE,
  description         text,
  brand_color         text,
  logo_url            text,
  billing_email       text,

  created_by_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT organizations_slug_chk CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$')
);

CREATE INDEX IF NOT EXISTS organizations_created_by_idx
  ON public.organizations (created_by_user_id);

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  role            text NOT NULL DEFAULT 'org_viewer'
                  CHECK (role IN ('org_owner', 'org_admin', 'org_viewer')),
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'invited', 'revoked')),

  invited_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS organization_members_user_idx
  ON public.organization_members (user_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS organization_members_org_idx
  ON public.organization_members (organization_id) WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- Foreign key column on workspaces
-- ---------------------------------------------------------------------------

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS organization_id uuid
    REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workspaces_organization_idx
  ON public.workspaces (organization_id) WHERE organization_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- activity_logs stamps org_id so the org dashboard can show a feed
-- ---------------------------------------------------------------------------

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS organization_id uuid
    REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS activity_logs_organization_recent_idx
  ON public.activity_logs (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members  ENABLE ROW LEVEL SECURITY;

-- A user can see + update orgs they belong to.
DROP POLICY IF EXISTS "organizations_member_read" ON public.organizations;
CREATE POLICY "organizations_member_read"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM public.organization_members
       WHERE user_id = auth.uid() AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "organizations_owner_write" ON public.organizations;
CREATE POLICY "organizations_owner_write"
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM public.organization_members
       WHERE user_id = auth.uid()
         AND status = 'active'
         AND role IN ('org_owner', 'org_admin')
    )
  );

DROP POLICY IF EXISTS "organization_members_self" ON public.organization_members;
CREATE POLICY "organization_members_self"
  ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
       WHERE user_id = auth.uid() AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "organization_members_owner_write" ON public.organization_members;
CREATE POLICY "organization_members_owner_write"
  ON public.organization_members
  FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
       WHERE user_id = auth.uid()
         AND status = 'active'
         AND role IN ('org_owner', 'org_admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
       WHERE user_id = auth.uid()
         AND status = 'active'
         AND role IN ('org_owner', 'org_admin')
    )
  );

DROP TRIGGER IF EXISTS organizations_set_updated_at ON public.organizations;
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS organization_members_set_updated_at ON public.organization_members;
CREATE TRIGGER organization_members_set_updated_at
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
