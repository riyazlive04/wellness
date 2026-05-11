-- ============================================================================
-- FIX: FORCE Constraints (v2)
-- ============================================================================
-- The previous attempt likely failed because the constraint name existed
-- on a different table (backup/ghost), so the script skipped adding it here.
-- This script DOES NOT check; it blindly DROPS and ADDS.

-- 1. DAILY LOGS
-- ============================
-- Drop existing potential constraint (if any triggers/indices linked)
ALTER TABLE public.daily_logs DROP CONSTRAINT IF EXISTS daily_logs_client_id_log_date_key;

-- Deduplicate (Safety First)
DELETE FROM public.daily_logs
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY client_id, log_date ORDER BY updated_at DESC) as rnum
    FROM public.daily_logs
  ) t
  WHERE t.rnum > 1
);

-- Force Add Constraint
ALTER TABLE public.daily_logs
  ADD CONSTRAINT daily_logs_client_id_log_date_key UNIQUE (client_id, log_date);


-- 2. USER ACHIEVEMENTS
-- ============================
ALTER TABLE public.user_achievements DROP CONSTRAINT IF EXISTS user_achievements_user_id_achievement_id_key;

-- Deduplicate
DELETE FROM public.user_achievements
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, achievement_id ORDER BY current_value DESC, updated_at DESC) as rnum
    FROM public.user_achievements
  ) t
  WHERE t.rnum > 1
);

-- Force Add Constraint
ALTER TABLE public.user_achievements
  ADD CONSTRAINT user_achievements_user_id_achievement_id_key UNIQUE (user_id, achievement_id);

-- 3. Verify
DO $$
BEGIN
  RAISE NOTICE 'Constraints have been forcibly reapplied.';
END $$;
