-- Time-bounded "challenges" on top of community_groups.
--
-- A challenge IS a community_group with extra columns: a metric to track,
-- a target value, a window (starts_at, ends_at). The existing membership/
-- posts/feed code keeps working unchanged.

DO $$ BEGIN
  CREATE TYPE public.community_challenge_metric AS ENUM (
    'water_ml',         -- daily_logs.water_intake summed in window
    'exercise_minutes', -- daily_logs.activity_minutes summed in window
    'posts',            -- count of community_posts authored in the group in window
    'streak_days'       -- consecutive logged days inside the window
  );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

ALTER TABLE public.community_groups
  ADD COLUMN IF NOT EXISTS is_challenge   boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS starts_at      timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at        timestamptz,
  ADD COLUMN IF NOT EXISTS target_metric  public.community_challenge_metric,
  ADD COLUMN IF NOT EXISTS target_value   integer;

-- Index for the home-page "active challenges" lookup. We hit it filtered
-- by (is_challenge, ends_at >= now()) so a partial index pays for itself.
CREATE INDEX IF NOT EXISTS idx_community_groups_active_challenges
  ON public.community_groups (ends_at DESC NULLS LAST)
  WHERE is_challenge = true;

COMMENT ON COLUMN public.community_groups.is_challenge IS
  'When true, this group is a time-bounded challenge. target_metric + target_value drive the leaderboard query.';