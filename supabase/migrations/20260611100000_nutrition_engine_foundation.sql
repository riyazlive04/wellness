-- =============================================================================
-- Nutrition Intelligence Engine — Phase 1 foundation
--
-- Healthcare-grade nutrition data model. AI identifies, this engine calculates.
-- Every nutrient value originates from a citable database (IFCT 2017, USDA FDC,
-- or admin-approved custom). Every calculation is auditable and reproducible.
--
-- Tables:
--   public.foods                 — canonical food registry, source-tagged
--   public.food_nutrients        — per-100g composition (IFCT-aligned schema)
--   public.cooking_methods       — yield + oil absorption factors
--   public.nutrient_retention    — per-method × per-nutrient retention
--   public.food_aliases          — multi-language + variant name resolution
--   public.custom_foods          — workspace submissions, super-admin approval
--   public.nutrition_audit       — immutable calculation trace
--
-- Design notes:
--   - food_nutrients is wide rather than EAV-tall because the IFCT schema is
--     fixed and stable; wide rows are faster to read and easier to validate.
--   - cooking_methods.yield_factor: cooked_weight / raw_weight. E.g. rice 1kg
--     raw → ~2.6kg cooked, so yield_factor = 2.6. Used to scale nutrient values
--     when the caller passes a raw weight but wants cooked nutrition.
--   - retention_factor: fraction of a nutrient surviving the cooking method.
--     E.g. vitamin C in boiled potatoes ≈ 0.50 (50% lost to water).
--   - All tables are platform-global (no workspace_id) — nutrition data is
--     scientific truth, not tenant-scoped. EXCEPT custom_foods, which are
--     workspace-submitted and approved into the global foods table.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. foods — canonical food registry
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.foods (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provenance
  source                    text NOT NULL CHECK (source IN ('IFCT-2017', 'USDA-FDC', 'FAO', 'CUSTOM-APPROVED')),
  source_id                 text,
  -- e.g. IFCT food code A001, USDA fdcId 1102702
  -- Some rows may not have a source_id (legacy imports), so it's nullable.

  -- Identity
  canonical_name            text NOT NULL,
  scientific_name           text,
  category                  text NOT NULL CHECK (category IN (
    'cereals', 'pulses', 'leafy_vegetables', 'roots_tubers', 'other_vegetables',
    'fruits', 'milk_products', 'meat', 'poultry', 'fish_seafood', 'eggs',
    'fats_oils', 'sugars', 'beverages', 'condiments_spices', 'nuts_seeds',
    'cooked_dishes', 'baked_goods', 'fast_food', 'misc'
  )),

  -- Default state of the food when nutrient values were measured.
  -- 'raw'    — nutrients are as-measured raw, must be transformed if cooked
  -- 'cooked' — nutrients are as-measured cooked, no further transformation
  -- 'as_consumed' — drinks, fruits eaten raw with no cooking modifier
  measurement_state         text NOT NULL DEFAULT 'as_consumed'
                            CHECK (measurement_state IN ('raw', 'cooked', 'as_consumed')),

  -- Edible portion as a fraction of total weight. Banana with peel = 0.65.
  -- Apple cored = 0.92. Whole egg in shell = 0.88. Always ≤ 1.0.
  edible_portion_fraction   numeric(4, 3) NOT NULL DEFAULT 1.000
                            CHECK (edible_portion_fraction BETWEEN 0 AND 1),

  -- Density for volume → weight conversions (g per mL). NULL if not applicable.
  density_g_per_ml          numeric(6, 3),

  -- Typical serving in grams (for "1 serving" defaults). 30g for nuts,
  -- 100g for cooked rice, 250mL for milk, etc.
  default_serving_g         numeric(7, 2),

  -- Workflow
  is_admin_approved         boolean NOT NULL DEFAULT true,
  -- IFCT/USDA imports default to approved; custom submissions default false
  -- until super_admin promotes them via /admin/nutrition/foods/:id/approve.

  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS foods_category_idx
  ON public.foods (category) WHERE is_admin_approved = true;

-- Trigram index for fast fuzzy name search ("biriyani" finds "biryani").
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS foods_canonical_name_trgm_idx
  ON public.foods USING gin (canonical_name gin_trgm_ops)
  WHERE is_admin_approved = true;

-- ---------------------------------------------------------------------------
-- 2. food_nutrients — per-100g composition. Wide row, IFCT-aligned schema.
--    All values are per 100 g of edible portion in the food's measurement_state.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.food_nutrients (
  food_id                   uuid PRIMARY KEY REFERENCES public.foods(id) ON DELETE CASCADE,

  -- Proximates (always present)
  water_g                   numeric(7, 3),
  energy_kcal               numeric(7, 2) NOT NULL,
  energy_kj                 numeric(7, 2),
  protein_g                 numeric(6, 3) NOT NULL,
  carbohydrate_g            numeric(6, 3) NOT NULL,
  fat_g                     numeric(6, 3) NOT NULL,
  fiber_g                   numeric(6, 3),
  sugar_g                   numeric(6, 3),
  ash_g                     numeric(6, 3),

  -- Fat sub-fractions
  saturated_fat_g           numeric(6, 3),
  mufa_g                    numeric(6, 3),
  pufa_g                    numeric(6, 3),
  trans_fat_g               numeric(6, 3),
  cholesterol_mg            numeric(7, 2),

  -- Carb sub-fractions
  starch_g                  numeric(6, 3),
  glycemic_index            numeric(5, 2),    -- per IFCT where available

  -- Minerals (mg unless noted)
  sodium_mg                 numeric(8, 2),
  potassium_mg              numeric(8, 2),
  calcium_mg                numeric(8, 2),
  iron_mg                   numeric(7, 3),
  magnesium_mg              numeric(7, 2),
  phosphorus_mg             numeric(8, 2),
  zinc_mg                   numeric(7, 3),
  copper_mg                 numeric(6, 3),
  manganese_mg              numeric(6, 3),
  selenium_mcg              numeric(7, 2),
  iodine_mcg                numeric(7, 2),
  chromium_mcg              numeric(7, 2),

  -- Vitamins
  vit_a_mcg_rae             numeric(8, 2),    -- retinol activity equivalent
  vit_d_mcg                 numeric(6, 3),
  vit_e_mg                  numeric(6, 3),
  vit_k_mcg                 numeric(7, 2),
  vit_c_mg                  numeric(7, 2),
  vit_b1_thiamin_mg         numeric(6, 3),
  vit_b2_riboflavin_mg      numeric(6, 3),
  vit_b3_niacin_mg          numeric(6, 3),
  vit_b5_pantothenic_mg     numeric(6, 3),
  vit_b6_pyridoxine_mg      numeric(6, 3),
  vit_b7_biotin_mcg         numeric(6, 3),
  vit_b9_folate_mcg         numeric(7, 2),
  vit_b12_cobalamin_mcg     numeric(6, 3),
  choline_mg                numeric(7, 2),

  -- Amino acids (IFCT publishes complete profile; we keep top-10)
  tryptophan_g              numeric(6, 3),
  threonine_g               numeric(6, 3),
  isoleucine_g              numeric(6, 3),
  leucine_g                 numeric(6, 3),
  lysine_g                  numeric(6, 3),
  methionine_g              numeric(6, 3),
  cystine_g                 numeric(6, 3),
  phenylalanine_g           numeric(6, 3),
  tyrosine_g                numeric(6, 3),
  valine_g                  numeric(6, 3),

  -- Phytochemicals (selective — most relevant for wellness coaching)
  phytate_mg                numeric(7, 2),
  oxalate_mg                numeric(7, 2),
  tannins_mg                numeric(7, 2),

  -- Data quality
  source_version            text NOT NULL DEFAULT 'IFCT-2017',
  imported_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT macros_non_negative CHECK (
    energy_kcal >= 0 AND protein_g >= 0 AND carbohydrate_g >= 0 AND fat_g >= 0
  )
);

-- ---------------------------------------------------------------------------
-- 3. cooking_methods — yield + oil absorption factors
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cooking_methods (
  code                      text PRIMARY KEY,
  label                     text NOT NULL,

  -- Cooked weight / raw weight. >1 when water is gained (rice 2.6), <1 when
  -- water is lost (steak 0.75). NULL for non-cooking methods (e.g. 'raw').
  yield_factor              numeric(5, 3),

  -- Grams of cooking oil absorbed per 100g of food. Deep frying ≈ 8-18 g,
  -- pan frying ≈ 3-5 g, sauteed ≈ 1-2 g.
  oil_absorption_g_per_100g numeric(5, 2) NOT NULL DEFAULT 0,

  -- Water added by the method per 100g (curries, stews). For nutrient
  -- dilution accounting in future phases.
  water_added_g_per_100g    numeric(5, 2) NOT NULL DEFAULT 0,

  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. nutrient_retention — fraction of a nutrient surviving the cooking method
--    Sourced from USDA Table of Nutrient Retention Factors and IFCT appendix.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.nutrient_retention (
  cooking_method            text NOT NULL REFERENCES public.cooking_methods(code) ON DELETE CASCADE,
  nutrient_code             text NOT NULL,
  -- nutrient_code maps to a column in food_nutrients (e.g. 'vit_c_mg').
  retention_factor          numeric(4, 3) NOT NULL DEFAULT 1.000
                            CHECK (retention_factor BETWEEN 0 AND 1.5),

  notes                     text,
  PRIMARY KEY (cooking_method, nutrient_code)
);

-- ---------------------------------------------------------------------------
-- 5. food_aliases — multi-language + variant name resolution
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.food_aliases (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id                   uuid NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
  alias                     text NOT NULL,
  language_code             text NOT NULL DEFAULT 'en',
  -- ISO 639-1: en, hi, ta, te, bn, kn, ml, mr, gu, pa…
  UNIQUE (food_id, alias, language_code)
);

CREATE INDEX IF NOT EXISTS food_aliases_alias_trgm_idx
  ON public.food_aliases USING gin (alias gin_trgm_ops);

CREATE INDEX IF NOT EXISTS food_aliases_lang_idx
  ON public.food_aliases (language_code);

-- ---------------------------------------------------------------------------
-- 6. custom_foods — workspace-submitted, super-admin reviewed
--    Promotion to public.foods sets foods.source = 'CUSTOM-APPROVED'.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.custom_foods (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  submitted_by              uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  canonical_name            text NOT NULL,
  category                  text NOT NULL,
  measurement_state         text NOT NULL DEFAULT 'as_consumed',
  edible_portion_fraction   numeric(4, 3) NOT NULL DEFAULT 1.000,

  -- Submitted nutrients per 100g — same shape as food_nutrients but JSONB
  -- so we can iterate the schema without migrating this side-table.
  submitted_nutrients       jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_aliases         jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_citation           text,   -- "Owner's lab tested" / "From IDA tables" / etc.

  status                    text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected', 'needs_revision')),
  reviewed_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at               timestamptz,
  review_notes              text,
  promoted_food_id          uuid REFERENCES public.foods(id) ON DELETE SET NULL,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_foods_workspace_idx
  ON public.custom_foods (workspace_id, status);
CREATE INDEX IF NOT EXISTS custom_foods_pending_idx
  ON public.custom_foods (status, created_at) WHERE status = 'pending';

ALTER TABLE public.custom_foods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_foods_workspace_member" ON public.custom_foods;
CREATE POLICY "custom_foods_workspace_member"
  ON public.custom_foods FOR ALL TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM public.workspace_members
     WHERE user_id = auth.uid() AND status = 'active'
  ));

-- ---------------------------------------------------------------------------
-- 7. nutrition_audit — immutable calculation trace
--    One row per calculate() call. Inputs + outputs + engine version frozen
--    so a result can always be re-explained, even if engine logic changes.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.nutrition_audit (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What was calculated
  target_type               text NOT NULL CHECK (target_type IN ('food', 'recipe', 'meal_log', 'plate_vision', 'voice_log')),
  target_id                 uuid,
  food_id                   uuid REFERENCES public.foods(id) ON DELETE SET NULL,

  -- Inputs frozen
  inputs                    jsonb NOT NULL,
  -- e.g. {quantity_g: 230, cooking_method: 'curried', portion_estimate: 'AI'}

  -- Outputs frozen — the full nutrition shape returned to the caller
  outputs                   jsonb NOT NULL,

  -- Reproducibility
  engine_version            text NOT NULL,         -- e.g. "1.0.0"
  database_version          text NOT NULL,         -- e.g. "IFCT-2017+USDA-FDC-2024-04"
  ai_confidence             numeric(4, 3),         -- 0..1, NULL if not from AI

  -- Who triggered it (NULL for system calls / batch importers)
  actor_user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  workspace_id              uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,

  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nutrition_audit_target_idx
  ON public.nutrition_audit (target_type, target_id);
CREATE INDEX IF NOT EXISTS nutrition_audit_food_idx
  ON public.nutrition_audit (food_id);
CREATE INDEX IF NOT EXISTS nutrition_audit_workspace_idx
  ON public.nutrition_audit (workspace_id, created_at DESC);

ALTER TABLE public.nutrition_audit ENABLE ROW LEVEL SECURITY;

-- Super admins read all; workspace members read their workspace's audit trail.
DROP POLICY IF EXISTS "nutrition_audit_workspace" ON public.nutrition_audit;
CREATE POLICY "nutrition_audit_workspace"
  ON public.nutrition_audit FOR SELECT TO authenticated
  USING (
    workspace_id IS NULL  -- system rows visible to everyone
    OR workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
       WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- 8. updated_at triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at_nutrition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS foods_set_updated_at ON public.foods;
CREATE TRIGGER foods_set_updated_at
  BEFORE UPDATE ON public.foods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_nutrition();

DROP TRIGGER IF EXISTS custom_foods_set_updated_at ON public.custom_foods;
CREATE TRIGGER custom_foods_set_updated_at
  BEFORE UPDATE ON public.custom_foods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_nutrition();

-- =============================================================================
-- Seed: cooking_methods + nutrient_retention factors
-- Sources cited inline. These are documented constants, not estimates.
-- =============================================================================

INSERT INTO public.cooking_methods (code, label, yield_factor, oil_absorption_g_per_100g, water_added_g_per_100g, notes) VALUES
  ('raw',          'Raw',              NULL,  0.0,  0.0,  'No cooking transformation.'),
  ('boiled',       'Boiled',           1.000, 0.0,  0.0,  'In water; nutrient losses to water captured in retention table.'),
  ('steamed',      'Steamed',          0.950, 0.0,  0.0,  'Best nutrient retention. Slight moisture loss.'),
  ('grilled',      'Grilled',          0.750, 0.5,  0.0,  'Meat-style dry heat. Moisture loss ~25%.'),
  ('roasted',      'Roasted',          0.800, 1.0,  0.0,  'Oven dry-heat with light fat. Veg/meat alike.'),
  ('baked',        'Baked',            0.880, 0.5,  0.0,  'Closed oven heat.'),
  ('sauteed',      'Sauteed',          0.900, 2.0,  0.0,  'Quick pan-cook in small oil.'),
  ('pan_fried',    'Pan fried',        0.850, 4.0,  0.0,  'Shallow oil; 3-5g absorption typical.'),
  ('deep_fried',   'Deep fried',       0.800, 12.0, 0.0,  'Deep oil bath; 8-18g per 100g common.'),
  ('stir_fried',   'Stir fried',       0.880, 3.0,  0.0,  'Asian wok-style; modest oil.'),
  ('curried',      'Curried',          1.100, 5.0,  15.0, 'Indian gravy-based; oil + water added.'),
  ('tandoor',      'Tandoor',          0.770, 1.5,  0.0,  'Indian clay oven; high heat, slight oil.'),
  ('pressure_cooked','Pressure cooked',1.050, 0.0,  5.0,  'Closed-system high-pressure; minimal nutrient loss.'),
  ('microwaved',   'Microwaved',       0.950, 0.0,  0.0,  'Generally retains nutrients well.'),
  ('fermented',    'Fermented',        1.000, 0.0,  0.0,  'Idli, dosa batter etc. May enhance some B-vitamins.')
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  yield_factor = EXCLUDED.yield_factor,
  oil_absorption_g_per_100g = EXCLUDED.oil_absorption_g_per_100g,
  water_added_g_per_100g = EXCLUDED.water_added_g_per_100g,
  notes = EXCLUDED.notes;

-- Retention factors sourced from USDA Table of Nutrient Retention Factors
-- (Release 6, 2007) and IFCT 2017 Appendix. Only the most cooking-sensitive
-- nutrients are seeded — anything not in this table defaults to 1.0 (full
-- retention) at the engine level.
INSERT INTO public.nutrient_retention (cooking_method, nutrient_code, retention_factor, notes) VALUES
  -- Vitamin C — water-soluble, heat-labile, oxygen-sensitive
  ('boiled',     'vit_c_mg',          0.500, 'USDA RF; significant loss to water.'),
  ('steamed',    'vit_c_mg',          0.750, 'USDA RF; better than boiled.'),
  ('grilled',    'vit_c_mg',          0.700, 'USDA RF.'),
  ('roasted',    'vit_c_mg',          0.650, 'USDA RF.'),
  ('baked',      'vit_c_mg',          0.700, 'USDA RF.'),
  ('sauteed',    'vit_c_mg',          0.700, 'USDA RF.'),
  ('pan_fried',  'vit_c_mg',          0.600, 'USDA RF.'),
  ('deep_fried', 'vit_c_mg',          0.500, 'USDA RF.'),
  ('curried',    'vit_c_mg',          0.450, 'Long simmer + acid; aggressive loss.'),
  ('microwaved', 'vit_c_mg',          0.800, 'USDA RF; short time, less loss.'),

  -- Thiamin (B1) — water-soluble, heat-labile
  ('boiled',     'vit_b1_thiamin_mg', 0.700, 'USDA RF.'),
  ('steamed',    'vit_b1_thiamin_mg', 0.850, 'USDA RF.'),
  ('grilled',    'vit_b1_thiamin_mg', 0.800, 'USDA RF.'),
  ('roasted',    'vit_b1_thiamin_mg', 0.780, 'USDA RF.'),
  ('baked',      'vit_b1_thiamin_mg', 0.820, 'USDA RF.'),
  ('sauteed',    'vit_b1_thiamin_mg', 0.800, 'USDA RF.'),
  ('pan_fried',  'vit_b1_thiamin_mg', 0.750, 'USDA RF.'),
  ('deep_fried', 'vit_b1_thiamin_mg', 0.650, 'USDA RF.'),
  ('curried',    'vit_b1_thiamin_mg', 0.600, 'Long simmer; further loss.'),

  -- Riboflavin (B2) — light-sensitive, fairly heat-stable
  ('boiled',     'vit_b2_riboflavin_mg', 0.850, 'USDA RF.'),
  ('steamed',    'vit_b2_riboflavin_mg', 0.920, 'USDA RF.'),
  ('grilled',    'vit_b2_riboflavin_mg', 0.880, 'USDA RF.'),
  ('roasted',    'vit_b2_riboflavin_mg', 0.900, 'USDA RF.'),
  ('baked',      'vit_b2_riboflavin_mg', 0.900, 'USDA RF.'),
  ('deep_fried', 'vit_b2_riboflavin_mg', 0.820, 'USDA RF.'),
  ('curried',    'vit_b2_riboflavin_mg', 0.800, 'USDA RF.'),

  -- Niacin (B3) — quite heat-stable, some loss via leaching
  ('boiled',     'vit_b3_niacin_mg',  0.800, 'USDA RF.'),
  ('steamed',    'vit_b3_niacin_mg',  0.900, 'USDA RF.'),
  ('curried',    'vit_b3_niacin_mg',  0.750, 'USDA RF.'),

  -- Folate (B9) — heat- and oxygen-labile
  ('boiled',     'vit_b9_folate_mcg', 0.550, 'USDA RF; significant loss.'),
  ('steamed',    'vit_b9_folate_mcg', 0.700, 'USDA RF.'),
  ('grilled',    'vit_b9_folate_mcg', 0.650, 'USDA RF.'),
  ('roasted',    'vit_b9_folate_mcg', 0.700, 'USDA RF.'),
  ('baked',      'vit_b9_folate_mcg', 0.750, 'USDA RF.'),
  ('deep_fried', 'vit_b9_folate_mcg', 0.500, 'USDA RF.'),
  ('curried',    'vit_b9_folate_mcg', 0.450, 'Long simmer.'),
  ('microwaved', 'vit_b9_folate_mcg', 0.800, 'USDA RF.'),

  -- Vitamin A — fat-soluble, heat-stable in absence of oxygen
  ('boiled',     'vit_a_mcg_rae',     0.900, 'USDA RF.'),
  ('deep_fried', 'vit_a_mcg_rae',     0.800, 'USDA RF.'),
  ('grilled',    'vit_a_mcg_rae',     0.850, 'USDA RF.'),
  ('curried',    'vit_a_mcg_rae',     0.850, 'USDA RF.'),

  -- Vitamin E — fat-soluble, fairly heat-stable; significant loss in frying
  ('deep_fried', 'vit_e_mg',          0.550, 'USDA RF; oxidative.'),
  ('pan_fried',  'vit_e_mg',          0.700, 'USDA RF.'),
  ('grilled',    'vit_e_mg',          0.750, 'USDA RF.'),

  -- Minerals (Na, K, Ca, Mg, Fe) — heat-stable but some loss to water
  ('boiled',     'potassium_mg',      0.800, 'Leaching into cooking water.'),
  ('boiled',     'sodium_mg',         0.850, 'Leaching into cooking water.'),
  ('boiled',     'magnesium_mg',      0.850, 'Leaching into cooking water.'),
  ('curried',    'potassium_mg',      0.900, 'Some retention in gravy water.')

ON CONFLICT (cooking_method, nutrient_code) DO UPDATE SET
  retention_factor = EXCLUDED.retention_factor,
  notes = EXCLUDED.notes;