-- =============================================================================
-- Plate Vision — dish-level AI estimates become the plate path
--
-- Plate Vision now takes its nutrition from the model's dish-level analysis
-- rather than routing each identified food through CalculatorService. The
-- deterministic engine is unchanged and still backs voice, barcode, meal-plans
-- and manual entry.
--
-- The problem this migration solves: `meal_logs.resolution_status` only allowed
--   resolved      — engine produced the numbers, audit_id present
--   manual_review — AI saw it, engine could not resolve it, NO numbers
--   manual_entry  — a human typed it
-- An AI-estimated item is none of those. Without a fourth value it would have
-- to masquerade as 'manual_entry', which would tell a reviewing nutritionist
-- that a human vouched for numbers a model guessed. That is the one confusion
-- this path must never create, so:
--
--   ai_estimated  — the MODEL produced the numbers from a photo. food_id and
--                   audit_id are NULL. Indicative, not clinical.
--
-- Rows written before this migration keep their existing status and their
-- frozen nutrition_snapshot. Nothing is backfilled or reinterpreted — history
-- stays exactly as it was recorded.
-- =============================================================================

-- ── meal_logs: allow AI-estimated items ──────────────────────────────────────

ALTER TABLE public.meal_logs
  DROP CONSTRAINT IF EXISTS meal_logs_resolution_status_check;

ALTER TABLE public.meal_logs
  ADD CONSTRAINT meal_logs_resolution_status_check
  CHECK (resolution_status IN ('resolved', 'manual_review', 'manual_entry', 'ai_estimated'));

COMMENT ON COLUMN public.meal_logs.resolution_status IS
  'resolved = engine produced nutrition (audit_id present); ai_estimated = the model estimated nutrition from a photo (no food_id, no audit_id, not reproducible); manual_review = AI saw it but the engine could not resolve it (no numbers); manual_entry = no AI step.';

-- ── plate_vision_meals: record provenance + the dish-level context ───────────

ALTER TABLE public.plate_vision_meals
  ADD COLUMN IF NOT EXISTS nutrition_source text NOT NULL DEFAULT 'engine'
    CHECK (nutrition_source IN ('engine', 'ai_estimate')),
  -- Dish-level output that has no home on the per-item rows: the identified
  -- dish and cuisine, the alternatives the model ruled out (so a correction is
  -- one tap), the invisible-ingredient assumptions it made, its calorie
  -- uncertainty band, and its health notes.
  --   { dish_name, cuisine, confidence, alternatives[], assumptions[],
  --     health_notes[], calories_range: { min, max } }
  ADD COLUMN IF NOT EXISTS analysis jsonb;

-- Existing rows predate the AI path and were all engine-computed. The DEFAULT
-- above already stamps them 'engine'; this is belt-and-braces for any row that
-- somehow carries a NULL.
UPDATE public.plate_vision_meals
   SET nutrition_source = 'engine'
 WHERE nutrition_source IS NULL;

COMMENT ON COLUMN public.plate_vision_meals.nutrition_source IS
  'engine = totals computed by CalculatorService from IFCT/USDA rows, reproducible via each item audit_id. ai_estimate = totals estimated by the vision model from the photo; indicative only, not reproducible. Review surfaces MUST distinguish the two.';

COMMENT ON COLUMN public.plate_vision_meals.analysis IS
  'Dish-level AI analysis context: dish_name, cuisine, confidence, alternatives[], assumptions[], health_notes[], calories_range. NULL for engine-sourced plates.';

-- Lets the review queue filter to AI-estimated plates, which is the set a
-- nutritionist most wants to eyeball first.
CREATE INDEX IF NOT EXISTS plate_vision_meals_source_idx
  ON public.plate_vision_meals (workspace_id, nutrition_source, logged_at DESC);
