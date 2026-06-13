-- =============================================================================
-- Plate Vision — meal sessions (Module 5)
--
-- The recognition + nutrition engine already produces per-item deterministic
-- nutrition (ai-vision → CalculatorService → nutrition_audit). This migration
-- adds the missing downstream stages of the documented pipeline:
--   Meal History  →  AI Insights  →  Nutritionist Review
--
-- Model:
--   public.plate_vision_meals   — ONE row per logged plate (the "meal session").
--                                 Holds aggregate frozen totals, the frozen AI
--                                 insight, and the nutritionist review state.
--   public.meal_logs            — reused for the per-FOOD items of a plate,
--                                 grouped by the new plate_group_id. Each item
--                                 keeps its own frozen nutrition_snapshot +
--                                 audit_id (added in 20260611140000).
--
-- Why a parent table rather than overloading meal_logs:
--   - A plate has N foods but ONE photo, ONE review decision, ONE insight.
--   - Trends/analytics read item snapshots; review + insight read the parent.
--   - Frozen aggregate totals avoid re-summing N items on every history read.
--
-- Nutrition numbers are NEVER stored from the client. The backend re-runs the
-- engine from (food_id, quantity_g, cooking_method) at log time and freezes the
-- result here. The AI insight only INTERPRETS those numbers — it never invents
-- nutrition values.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.plate_vision_meals (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  client_id            uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_id         uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,

  meal_type            public.meal_type NOT NULL,
  photo_url            text,
  notes                text,
  logged_at            timestamptz NOT NULL DEFAULT now(),

  -- How the plate was captured.
  source               text NOT NULL DEFAULT 'plate_vision'
                         CHECK (source IN ('plate_vision', 'voice', 'manual')),

  -- Frozen aggregate nutrition across the RESOLVED items (NutrientPanel-shaped
  -- subset: energy_kcal, protein_g, carbohydrate_g, fat_g, fiber_g, …).
  totals               jsonb NOT NULL DEFAULT '{}'::jsonb,
  item_count           integer NOT NULL DEFAULT 0,
  resolved_count       integer NOT NULL DEFAULT 0,

  -- Provenance of the capture.
  ai_confidence        numeric(4, 3)
                         CHECK (ai_confidence IS NULL OR ai_confidence BETWEEN 0 AND 1),
  ai_model             text,
  engine_version       text,

  -- Frozen AI insight (goal-based interpretation of the totals). NULL until
  -- generated; { summary, macro_balance, suggestions[], flags[], score, source }.
  insight              jsonb,
  insight_generated_at timestamptz,

  -- Nutritionist review.
  review_status        text NOT NULL DEFAULT 'pending'
                         CHECK (review_status IN ('pending', 'approved', 'adjusted', 'flagged')),
  reviewed_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at          timestamptz,
  review_note          text,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plate_vision_meals_client_idx
  ON public.plate_vision_meals (client_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS plate_vision_meals_review_idx
  ON public.plate_vision_meals (workspace_id, review_status, logged_at DESC);

-- Per-food items of a plate live in meal_logs, grouped by this id.
ALTER TABLE public.meal_logs
  ADD COLUMN IF NOT EXISTS plate_group_id uuid
    REFERENCES public.plate_vision_meals(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS meal_logs_plate_group_idx
  ON public.meal_logs (plate_group_id) WHERE plate_group_id IS NOT NULL;

-- RLS — backend writes use the service connection (bypasses RLS); these policies
-- keep direct/authenticated access correct: a client sees their own plates, a
-- workspace member sees plates in their workspace.
ALTER TABLE public.plate_vision_meals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients read own plates" ON public.plate_vision_meals;
CREATE POLICY "Clients read own plates"
  ON public.plate_vision_meals FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.clients c
     WHERE c.id = plate_vision_meals.client_id AND c.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Workspace members read workspace plates" ON public.plate_vision_meals;
CREATE POLICY "Workspace members read workspace plates"
  ON public.plate_vision_meals FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
     WHERE wm.workspace_id = plate_vision_meals.workspace_id
       AND wm.user_id = auth.uid()
       AND wm.status = 'active'
  ));

COMMENT ON TABLE public.plate_vision_meals IS
  'One row per logged Plate Vision meal session: frozen aggregate nutrition, frozen AI insight, and nutritionist review state. Per-food items live in meal_logs (plate_group_id).';
