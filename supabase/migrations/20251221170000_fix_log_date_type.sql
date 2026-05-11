-- 2026-05-11: original migration assumed log_date was TEXT in the live DB.
-- In a clean dev rebuild log_date is already DATE, so the text-comparison
-- branches in the original CASE expression crashed. Rewritten to be
-- idempotent: only convert if column is still text, and use a constraint
-- name guard so re-runs don't fail.

DO $$
DECLARE
  v_type text;
BEGIN
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'daily_logs'
    AND column_name = 'log_date';

  IF v_type = 'text' THEN
    -- Drop dependent constraint
    ALTER TABLE public.daily_logs
      DROP CONSTRAINT IF EXISTS daily_logs_client_id_log_date_key;

    -- Convert TEXT -> DATE with safe fallback
    ALTER TABLE public.daily_logs
      ALTER COLUMN log_date TYPE date
      USING (
        CASE
          WHEN log_date IS NULL OR log_date = '' THEN CURRENT_DATE
          WHEN log_date ~ '^\d{4}' THEN log_date::date
          ELSE CURRENT_DATE
        END
      );

    -- Dedupe rows whose dates collapsed onto the same day
    DELETE FROM public.daily_logs
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY client_id, log_date ORDER BY updated_at DESC) AS rnum
        FROM public.daily_logs
      ) t
      WHERE t.rnum > 1
    );
  END IF;

  -- Add the unique constraint if it isn't already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'daily_logs_client_id_log_date_key'
  ) THEN
    ALTER TABLE public.daily_logs
      ADD CONSTRAINT daily_logs_client_id_log_date_key UNIQUE (client_id, log_date);
  END IF;
END $$;
