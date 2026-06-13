-- =============================================================================
-- Workspace recipes — nutritionist-authored recipes whose nutrition is computed
-- live from the foods library (NOT a frozen snapshot).
--
-- Tables:
--   public.workspace_recipes              — recipe header (name, servings, yield)
--   public.workspace_recipe_ingredients   — rows of food_id + grams + cooking method
--
-- Design choices:
--   - Ingredients reference public.foods.id directly. No more parallel
--     `ingredients` catalog — the IFCT/USDA library IS the ingredient catalog.
--   - Nutrition is computed on the fly by WorkspaceRecipeService (sum of per-
--     ingredient NutritionEngineService.calculate calls). No snapshot column.
--     If we ever want a fast list view, we can add a denormalised total_kcal
--     trigger later.
--   - cooking_method references public.cooking_methods(code), same FK shape as
--     meal_logs. Default 'raw' for raw ingredients, override per row.
--   - yield_factor on the recipe header lets the nutritionist mark recipes
--     that lose/gain weight overall (e.g. simmered curry reduces by ~10%).
--     Default 1.0 = cooked weight equals sum of raw ingredient weights.
--   - is_published controls visibility in pickers. false = draft.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_recipes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  name                text NOT NULL,
  description         text,
  category            text,
  -- Freeform category label (e.g. "Breakfast", "Indian curry"). Not constrained
  -- to the foods.category enum because recipes are dish-typed, not food-typed.

  servings            integer NOT NULL DEFAULT 1 CHECK (servings >= 1),
  yield_factor        numeric(5, 3) NOT NULL DEFAULT 1.000
                      CHECK (yield_factor BETWEEN 0.1 AND 5.0),
  -- cooked_weight / sum(raw_ingredient_weights). 1.0 = no overall change.

  instructions        text,
  notes               text,
  is_published        boolean NOT NULL DEFAULT true,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_recipes_workspace_idx
  ON public.workspace_recipes (workspace_id, name);

CREATE INDEX IF NOT EXISTS workspace_recipes_workspace_published_idx
  ON public.workspace_recipes (workspace_id, is_published, name);

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspace_recipe_ingredients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id       uuid NOT NULL REFERENCES public.workspace_recipes(id) ON DELETE CASCADE,
  food_id         uuid NOT NULL REFERENCES public.foods(id) ON DELETE RESTRICT,

  quantity_g      numeric(8, 2) NOT NULL CHECK (quantity_g > 0),
  cooking_method  text NOT NULL DEFAULT 'raw' REFERENCES public.cooking_methods(code) ON DELETE RESTRICT,
  quantity_state  text NOT NULL DEFAULT 'as_consumed'
                  CHECK (quantity_state IN ('raw', 'as_consumed')),

  sort_order      integer NOT NULL DEFAULT 0,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_recipe_ingredients_recipe_idx
  ON public.workspace_recipe_ingredients (recipe_id, sort_order);

-- Reverse lookup: "which recipes use this food?" — useful for both the audit
-- trail and when an admin wants to retire a custom food.
CREATE INDEX IF NOT EXISTS workspace_recipe_ingredients_food_idx
  ON public.workspace_recipe_ingredients (food_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.workspace_recipes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_recipe_ingredients    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_recipes_member" ON public.workspace_recipes;
CREATE POLICY "workspace_recipes_member"
  ON public.workspace_recipes
  FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
       WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
       WHERE user_id = auth.uid() AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "workspace_recipe_ingredients_member" ON public.workspace_recipe_ingredients;
CREATE POLICY "workspace_recipe_ingredients_member"
  ON public.workspace_recipe_ingredients
  FOR ALL
  TO authenticated
  USING (
    recipe_id IN (
      SELECT id FROM public.workspace_recipes
       WHERE workspace_id IN (
         SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid() AND status = 'active'
       )
    )
  )
  WITH CHECK (
    recipe_id IN (
      SELECT id FROM public.workspace_recipes
       WHERE workspace_id IN (
         SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid() AND status = 'active'
       )
    )
  );

-- ---------------------------------------------------------------------------
-- updated_at trigger (reuses the platform-wide set_updated_at function)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS workspace_recipes_set_updated_at ON public.workspace_recipes;
CREATE TRIGGER workspace_recipes_set_updated_at
  BEFORE UPDATE ON public.workspace_recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
