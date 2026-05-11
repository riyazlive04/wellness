-- ============================================================================
-- FIX: Missing Unique Constraints
-- ============================================================================
-- The error "no unique or exclusion constraint matching the ON CONFLICT specification"
-- means these constraints are missing. We must add them to allow the upsert logic to work.

-- 1. Clean up duplicate DAILY LOGS (keep the most recently updated one)
DELETE FROM public.daily_logs
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY client_id, log_date ORDER BY updated_at DESC) as rnum
    FROM public.daily_logs
  ) t
  WHERE t.rnum > 1
);

-- 2. Add Unique Constraint to DAILY LOGS
-- We use DO block to avoid error if it already exists (though the error suggests it doesn't)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_logs_client_id_log_date_key'
  ) THEN
    ALTER TABLE public.daily_logs
      ADD CONSTRAINT daily_logs_client_id_log_date_key UNIQUE (client_id, log_date);
  END IF;
END $$;


-- 3. Clean up duplicate USER ACHIEVEMENTS (keep the highest value/most recent)
DELETE FROM public.user_achievements
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, achievement_id ORDER BY current_value DESC, updated_at DESC) as rnum
    FROM public.user_achievements
  ) t
  WHERE t.rnum > 1
);

-- 4. Add Unique Constraint to USER ACHIEVEMENTS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_achievements_user_id_achievement_id_key'
  ) THEN
    ALTER TABLE public.user_achievements
      ADD CONSTRAINT user_achievements_user_id_achievement_id_key UNIQUE (user_id, achievement_id);
  END IF;
END $$;
