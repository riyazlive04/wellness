-- ============================================================================
-- Add missing tenant (workspace_id) indexes
-- ============================================================================
-- Audit finding: 10 tenant-scoped tables filter by workspace_id but had no
-- supporting index, forcing sequential scans as data grows. This migration
-- adds them, matching each table's real query shape:
--   * feed / time-ordered tables -> composite (workspace_id, <ts> DESC)
--   * lookup tables              -> plain   (workspace_id)
--   * nullable workspace_id      -> PARTIAL index (WHERE workspace_id IS NOT NULL)
--     because every query specifies a concrete workspace_id, never NULL.
--
-- NOTE ON LIVE PROD: this file uses plain CREATE INDEX (transaction-safe for the
-- Supabase CLI). On a live database with active writes, prefer the CONCURRENTLY
-- variant run manually in the Supabase SQL editor (see deploy note) to avoid a
-- brief write lock. Index NAMES match, and all use IF NOT EXISTS, so running the
-- CONCURRENTLY version first makes this migration a harmless no-op.
-- ============================================================================

-- High-volume, time-ordered (workspace_id NOT NULL) ---------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_workspace
  ON public.notifications (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_team_messages_workspace
  ON public.team_messages (workspace_id, created_at DESC);

-- High-volume, time-ordered (workspace_id NULLABLE -> partial) -----------------
CREATE INDEX IF NOT EXISTS idx_community_posts_workspace
  ON public.community_posts (workspace_id, created_at DESC)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_community_comments_workspace
  ON public.community_comments (workspace_id, created_at DESC)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assistant_actions_workspace
  ON public.assistant_actions (workspace_id, created_at DESC)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_workspace
  ON public.assistant_conversations (workspace_id, last_message_at DESC)
  WHERE workspace_id IS NOT NULL;

-- Lookup tables (workspace_id NULLABLE -> partial) ----------------------------
CREATE INDEX IF NOT EXISTS idx_community_reactions_workspace
  ON public.community_reactions (workspace_id)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_community_groups_workspace
  ON public.community_groups (workspace_id)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_policy_acceptances_workspace
  ON public.policy_acceptances (workspace_id)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deletion_requests_workspace
  ON public.deletion_requests (workspace_id)
  WHERE workspace_id IS NOT NULL;
