-- ============================================================================
-- SIRAH LIFE — Phase 1A: introduce multi-tenancy primitives.
--
-- Adds: workspaces, workspace_members, workspace_member_role enum,
-- super_admin value on app_role. RLS policies for both tables.
-- Does NOT add workspace_id columns to existing tenant tables — that's 160b.
--
-- The migration runner wraps this whole file in BEGIN/COMMIT.
-- Policy comparisons use ::text to avoid enum-literal parse-time validation
-- since super_admin is added in the same transaction.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend app_role with super_admin (idempotent)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.app_role'::regtype
      AND enumlabel = 'super_admin'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'super_admin';
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 2. workspaces table — the tenant boundary
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspaces (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text UNIQUE,
  owner_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  plan          text NOT NULL DEFAULT 'trial',
  trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','suspended','deleted')),
  -- Branding & contact (sparse, all optional)
  display_name  text,
  logo_url      text,
  brand_color   text,
  contact_email text,
  contact_phone text,
  city          text,
  country_code  text,
  -- Compliance
  gstin         text,
  pan           text,
  -- Lifecycle
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspaces_owner_id_idx ON public.workspaces(owner_id);
CREATE INDEX IF NOT EXISTS workspaces_status_idx   ON public.workspaces(status);

COMMENT ON TABLE public.workspaces IS
  'Tenant boundary for SIRAH LIFE. One row per nutritionist/clinic.';

-- ---------------------------------------------------------------------------
-- 3. workspace_member_role enum + workspace_members table
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workspace_member_role') THEN
    CREATE TYPE public.workspace_member_role AS ENUM (
      'owner',
      'nutritionist',
      'assistant_nutritionist',
      'receptionist',
      'coach',
      'support'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.workspace_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          public.workspace_member_role NOT NULL DEFAULT 'nutritionist',
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','invited','disabled')),
  invited_by    uuid REFERENCES auth.users(id),
  invited_at    timestamptz,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_members_unique UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS workspace_members_workspace_id_idx ON public.workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx      ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS workspace_members_role_idx         ON public.workspace_members(role);

COMMENT ON TABLE public.workspace_members IS
  'Users who can act within a workspace. One row per (workspace, user) pair.';

-- ---------------------------------------------------------------------------
-- 4. updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS workspaces_touch_updated_at ON public.workspaces;
CREATE TRIGGER workspaces_touch_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS workspace_members_touch_updated_at ON public.workspace_members;
CREATE TRIGGER workspace_members_touch_updated_at
  BEFORE UPDATE ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Row-Level Security (defence-in-depth; backend still filters explicitly)
--    `ur.role::text = 'super_admin'` sidesteps enum-literal parse validation
--    since super_admin is added in the same migration.
-- ---------------------------------------------------------------------------
ALTER TABLE public.workspaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspaces_select_own ON public.workspaces;
CREATE POLICY workspaces_select_own ON public.workspaces
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role::text = 'super_admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = id AND wm.user_id = auth.uid() AND wm.status = 'active'
    )
  );

DROP POLICY IF EXISTS workspace_members_select_same_workspace ON public.workspace_members;
CREATE POLICY workspace_members_select_same_workspace ON public.workspace_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role::text = 'super_admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_members me
      WHERE me.workspace_id = workspace_id AND me.user_id = auth.uid() AND me.status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- 6. current_workspace_id() — for use in RLS policies on tenant tables (160b)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id
  FROM public.workspace_members
  WHERE user_id = auth.uid() AND status = 'active'
  ORDER BY joined_at ASC
  LIMIT 1
$$;
