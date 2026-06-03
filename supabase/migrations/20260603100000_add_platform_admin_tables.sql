-- ============================================================================
-- SIRAH LIFE — Phase 1 super-admin foundation.
--
-- Three new tables for the platform-admin tier:
--   1. admin_audit_log — every super-admin action recorded for compliance + ops
--   2. platform_announcements — banner messages shown to all (or specific)
--      workspaces, authored by super_admins
--   3. platform_config — single-row key-value store for system-wide settings
--      (trial length, default AI quotas, feature flags, etc.)
--
-- All three are platform-level (NOT tenant-scoped — no workspace_id column).
-- Reads/writes go through the NestJS backend with super_admin role required.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. admin_audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Who did it (may be null if action originated from a system job)
  actor_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email   text,
  -- What happened — convention: '<resource>.<verb>'
  -- e.g. 'workspace.suspend', 'user.ban', 'super_admin.grant', 'announcement.publish'
  action        text NOT NULL,
  -- Optional structured target
  resource_type text,    -- 'workspace' | 'user' | 'super_admin' | 'announcement' | 'config'
  resource_id   uuid,
  resource_label text,   -- human-readable identifier (workspace name, user email, etc.)
  -- Free-form context
  details       jsonb,
  -- Request metadata
  ip_address    text,
  user_agent    text,
  request_id    text,
  -- When
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_actor_id_idx     ON public.admin_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx   ON public.admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx       ON public.admin_audit_log(action);
CREATE INDEX IF NOT EXISTS admin_audit_log_resource_idx     ON public.admin_audit_log(resource_type, resource_id);

COMMENT ON TABLE public.admin_audit_log IS
  'Append-only log of every super-admin action. Read via /api/v1/admin/audit.';

-- ---------------------------------------------------------------------------
-- 2. platform_announcements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_announcements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  body            text NOT NULL,
  /** info | warning | critical — drives the banner colour / urgency. */
  severity        text NOT NULL DEFAULT 'info'
                    CHECK (severity IN ('info', 'warning', 'critical')),
  /** If null, shown to ALL workspaces; otherwise just the listed workspace_ids. */
  target_workspace_ids uuid[],
  /** Lifecycle */
  published_at    timestamptz,
  starts_at       timestamptz NOT NULL DEFAULT now(),
  ends_at         timestamptz,
  dismissible     boolean NOT NULL DEFAULT true,
  /** Who created it */
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_announcements_published_active_idx
  ON public.platform_announcements(published_at, starts_at, ends_at)
  WHERE published_at IS NOT NULL;

COMMENT ON TABLE public.platform_announcements IS
  'Super-admin-authored banner messages. Workspace topbar polls /api/v1/announcements/active to render.';

-- updated_at trigger (reuses the public.touch_updated_at function added in 160a)
DROP TRIGGER IF EXISTS platform_announcements_touch_updated_at ON public.platform_announcements;
CREATE TRIGGER platform_announcements_touch_updated_at
  BEFORE UPDATE ON public.platform_announcements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. platform_config (single-row key-value)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_config (
  /** Always 1 — enforced by check constraint. Single-row table. */
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  /** Trial length in days for new workspaces. */
  trial_days  integer NOT NULL DEFAULT 30 CHECK (trial_days BETWEEN 0 AND 365),
  /** Plan definitions: array of { id, name, monthly_inr, ai_calls, features[] }. */
  plans       jsonb NOT NULL DEFAULT '[]'::jsonb,
  /** Feature flags: { feature_name: { enabled: bool, workspaces?: uuid[] } }. */
  feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  /** AI per-month quotas per plan id. */
  ai_quotas   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS platform_config_touch_updated_at ON public.platform_config;
CREATE TRIGGER platform_config_touch_updated_at
  BEFORE UPDATE ON public.platform_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed the single row if absent — with the SIRAH LIFE default plans you outlined.
INSERT INTO public.platform_config (id, trial_days, plans, ai_quotas)
VALUES (
  1,
  30,
  '[
    {"id": "starter",      "name": "Starter",      "monthly_inr": 999,  "ai_calls": 500,   "features": ["plate_vision", "voice_ai"]},
    {"id": "professional", "name": "Professional", "monthly_inr": 1999, "ai_calls": 2000,  "features": ["plate_vision", "voice_ai", "ai_assistant", "automation"]},
    {"id": "clinic",       "name": "Clinic",       "monthly_inr": 2999, "ai_calls": 5000,  "features": ["plate_vision", "voice_ai", "ai_assistant", "automation", "team"]},
    {"id": "enterprise",   "name": "Enterprise",   "monthly_inr": 3999, "ai_calls": 10000, "features": ["plate_vision", "voice_ai", "ai_assistant", "automation", "team", "white_label", "priority_support"]}
  ]'::jsonb,
  '{"starter": 500, "professional": 2000, "clinic": 5000, "enterprise": 10000}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.platform_config IS
  'Single-row platform settings table. Updated by super_admin via /api/v1/admin/config.';
