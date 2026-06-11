-- =============================================================================
-- meal_logs — freeze nutrition snapshot per logged meal
--
-- Phase 2 of the Nutrition Intelligence Engine. When a meal is logged via
-- Plate Vision or Voice AI (or manually), we now persist the deterministic
-- nutrition result returned by the engine alongside the meal row.
--
-- Why freeze the snapshot?
--   - Engine outputs are reproducible via audit_id, but engine logic itself
--     evolves. Freezing the result means a meal logged today always renders
--     the same numbers next year, even if we ship engine v2.x.
--   - Trends (daily/weekly/monthly) read directly from these snapshots
--     without re-running the calculator over every historical meal.
--   - Clinical sign-off: a nutritionist viewing a client's history sees
--     exactly what the client saw at log-time.
--
-- Columns:
--   ai_confidence      — 0..1 from Plate Vision / Voice AI (NULL if manually entered)
--   nutrition_snapshot — frozen NutrientPanel JSON returned by the engine
--   audit_id           — pointer into public.nutrition_audit for re-explanation
--   detected_name      — what the AI said the food was (may differ from the
--                        resolved canonical_name after engine routing)
--   resolution_status  — 'resolved' | 'manual_review' | 'manual_entry'
--   food_id            — resolved IFCT/USDA food id (NULL if manual)
--   cooking_method     — applied at calculate() time
-- =============================================================================

ALTER TABLE public.meal_logs
  ADD COLUMN IF NOT EXISTS ai_confidence       numeric(4, 3)
                            CHECK (ai_confidence IS NULL OR ai_confidence BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS nutrition_snapshot  jsonb,
  ADD COLUMN IF NOT EXISTS audit_id            uuid REFERENCES public.nutrition_audit(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS detected_name       text,
  ADD COLUMN IF NOT EXISTS resolution_status   text DEFAULT 'manual_entry'
                            CHECK (resolution_status IN ('resolved', 'manual_review', 'manual_entry')),
  ADD COLUMN IF NOT EXISTS food_id             uuid REFERENCES public.foods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cooking_method      text;

CREATE INDEX IF NOT EXISTS meal_logs_audit_idx
  ON public.meal_logs (audit_id) WHERE audit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS meal_logs_food_idx
  ON public.meal_logs (food_id) WHERE food_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS meal_logs_resolution_idx
  ON public.meal_logs (client_id, resolution_status, logged_at DESC);

COMMENT ON COLUMN public.meal_logs.nutrition_snapshot IS
  'Frozen NutrientPanel JSON from CalculatorService at log time. NULL when manual entry without engine routing.';
COMMENT ON COLUMN public.meal_logs.audit_id IS
  'Pointer into nutrition_audit for re-explaining the calculation. NULL when manual entry.';
COMMENT ON COLUMN public.meal_logs.ai_confidence IS
  '0..1 from Plate Vision / Voice AI identification step. NULL when manual entry.';
COMMENT ON COLUMN public.meal_logs.resolution_status IS
  'resolved = engine produced nutrition; manual_review = AI saw it but engine could not resolve; manual_entry = no AI step.';
