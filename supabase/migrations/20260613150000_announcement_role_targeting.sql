-- Announcement audience targeting by role.
--
-- platform_announcements already supports per-workspace targeting via
-- target_workspace_ids (empty = all workspaces). This adds an orthogonal
-- role filter so a super admin can address, e.g., "all nutritionists"
-- (across every workspace, or combined with a workspace subset).
--
-- Semantics (enforced in the /announcements/active query):
--   target_roles empty  → visible to every role
--   target_roles set    → visible only to members whose workspace_member_role
--                          is in the array. Clients / unaffiliated viewers
--                          (role IS NULL) never match a non-empty target_roles.

ALTER TABLE public.platform_announcements
  ADD COLUMN IF NOT EXISTS target_roles text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.platform_announcements.target_roles IS
  'Empty = all roles. Otherwise only workspace_member_role values listed here see the announcement.';
