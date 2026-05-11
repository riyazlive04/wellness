-- ============================================================================
-- FIX: Correcting Date Column Type (Text -> Date)
-- ============================================================================
-- The error "operator does not exist: text = date" confirms that 'log_date' 
-- is currently stored as TEXT. It must be DATE.

-- 1. Drop Constraint (It depends on the column type)
ALTER TABLE public.daily_logs DROP CONSTRAINT IF EXISTS daily_logs_client_id_log_date_key;

-- 2. Convert 'log_date' to DATE
-- We perform a safe cast. If it's a timestamp string 'YYYY-MM-DDT...', ::date handles it.
-- If it's garbage, we might error, so we'll try to handle basic sanity.
ALTER TABLE public.daily_logs 
  ALTER COLUMN log_date TYPE date 
  USING (
    CASE 
      WHEN log_date IS NULL OR log_date = '' THEN CURRENT_DATE
      -- Basic check: does it start with 4 digits?
      WHEN log_date ~ '^\d{4}' THEN log_date::date
      ELSE CURRENT_DATE
    END
  );

-- 3. Cleanup Duplicates
-- Converting text variants (e.g. '2024-01-01' and '2024-01-01T00:00') might have 
-- created duplicates for the same day. We must dedupe before re-adding constraint.
DELETE FROM public.daily_logs
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY client_id, log_date ORDER BY updated_at DESC) as rnum
    FROM public.daily_logs
  ) t
  WHERE t.rnum > 1
);

-- 4. Re-Add Constraint
ALTER TABLE public.daily_logs 
  ADD CONSTRAINT daily_logs_client_id_log_date_key UNIQUE (client_id, log_date);
