-- =============================================================================
-- Phase 2 client portal — schema additions.
--
-- 1. daily_logs.sleep_hours    — the 14-day rhythm chart needs this.
-- 2. clients.{allergies, medical_conditions, food_preferences,
--           activity_level, height_cm}
--    The brief says onboarding captures these. Existing `clients` table only
--    had identity + goals + target_kcal. These columns let the wellness
--    profile in Settings round-trip without a second table.
-- =============================================================================

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS sleep_hours numeric(4, 2);

COMMENT ON COLUMN public.daily_logs.sleep_hours IS
  'Hours of sleep for the night before this log_date. NULL = not logged.';

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS allergies          text,
  ADD COLUMN IF NOT EXISTS medical_conditions text,
  ADD COLUMN IF NOT EXISTS food_preferences   text,
  ADD COLUMN IF NOT EXISTS activity_level     text CHECK (
    activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')
    OR activity_level IS NULL
  ),
  ADD COLUMN IF NOT EXISTS height_cm          smallint;

COMMENT ON COLUMN public.clients.allergies          IS 'Free-text allergies — surfaced in AI meal planning.';
COMMENT ON COLUMN public.clients.medical_conditions IS 'Free-text conditions (PCOS, diabetes, etc).';
COMMENT ON COLUMN public.clients.food_preferences   IS 'Cuisine + dietary preferences (vegetarian, no spice, etc).';
COMMENT ON COLUMN public.clients.activity_level     IS 'Sedentary | light | moderate | active | very_active.';
COMMENT ON COLUMN public.clients.height_cm          IS 'Height in centimeters — used for BMI calculations.';