-- ============================================================================
-- FIX: Correcting Column Types (Text -> Numeric/Integer) - V3 (Robust)
-- ============================================================================
-- The error "invalid input syntax for type double precision: """ suggests that
-- the 'weight' column (or others) might ALREADY be numeric/double in some rows or 
-- Postgres is converting implicit types aggressively. 
--
-- FIX Strategy: Explicitly cast everything to TEXT before checking patterns/empty strings.
-- This works safely regardless of whether the column is currently TEXT, INTEGER, or NUMERIC.

-- 1. Fix 'activity_minutes' (should be integer)
ALTER TABLE public.daily_logs 
  ALTER COLUMN activity_minutes TYPE integer 
  USING (
    CASE 
      -- Safe text conversion first
      WHEN activity_minutes::text IS NULL OR activity_minutes::text = '' THEN 0 
      
      -- Regex check on TEXT representation
      WHEN activity_minutes::text ~ '^[0-9]+(\.[0-9]+)?$' THEN
        CASE 
          -- Clamp Huge values safety check
          WHEN activity_minutes::text::numeric > 2147483647 THEN 2147483647
          ELSE activity_minutes::text::numeric::integer
        END
      
      ELSE 0 
    END
  );

ALTER TABLE public.daily_logs ALTER COLUMN activity_minutes SET DEFAULT 0;


-- 2. Fix 'water_intake' (should be integer)
ALTER TABLE public.daily_logs 
  ALTER COLUMN water_intake TYPE integer 
  USING (
    CASE 
      WHEN water_intake::text IS NULL OR water_intake::text = '' THEN 0 
      WHEN water_intake::text ~ '^[0-9]+(\.[0-9]+)?$' THEN
        CASE 
           WHEN water_intake::text::numeric > 2147483647 THEN 2147483647
           ELSE water_intake::text::numeric::integer
        END
      ELSE 0 
    END
  );

ALTER TABLE public.daily_logs ALTER COLUMN water_intake SET DEFAULT 0;


-- 3. Fix 'weight' (should be numeric)
ALTER TABLE public.daily_logs 
  ALTER COLUMN weight TYPE numeric 
  USING (
    CASE 
      WHEN weight::text IS NULL OR weight::text = '' THEN 0 
      WHEN weight::text ~ '^[0-9]+(\.[0-9]+)?$' THEN weight::text::numeric 
      ELSE 0 
    END
  );

ALTER TABLE public.daily_logs ALTER COLUMN weight SET DEFAULT 0;
