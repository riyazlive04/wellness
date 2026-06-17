/**
 * Nutrition Intelligence Engine — type contracts.
 *
 * These are the values flowing across the engine boundary. Internal services
 * may use them directly; HTTP controllers expose subset shapes via DTOs.
 *
 * Version policy: this file is canonical. Frontend types mirror it.
 * If you change a field, bump ENGINE_VERSION (in calculator.service.ts)
 * and consider whether existing audit rows need re-interpretation.
 */

export const ENGINE_VERSION = '1.0.0';
export const DATABASE_VERSION_DEFAULT = 'IFCT-2017';

export type FoodSource = 'IFCT-2017' | 'USDA-FDC' | 'FAO' | 'CUSTOM-APPROVED';

export type FoodCategory =
  | 'cereals' | 'pulses' | 'leafy_vegetables' | 'roots_tubers' | 'other_vegetables'
  | 'fruits' | 'milk_products' | 'meat' | 'poultry' | 'fish_seafood' | 'eggs'
  | 'fats_oils' | 'sugars' | 'beverages' | 'condiments_spices' | 'nuts_seeds'
  | 'cooked_dishes' | 'baked_goods' | 'fast_food' | 'misc';

export type MeasurementState = 'raw' | 'cooked' | 'as_consumed';

export type CookingMethodCode =
  | 'raw' | 'boiled' | 'steamed' | 'grilled' | 'roasted' | 'baked'
  | 'sauteed' | 'pan_fried' | 'deep_fried' | 'stir_fried' | 'curried'
  | 'tandoor' | 'pressure_cooked' | 'microwaved' | 'fermented';

export interface FoodSummary {
  id: string;
  source: FoodSource;
  source_id: string | null;
  canonical_name: string;
  category: FoodCategory;
  measurement_state: MeasurementState;
  edible_portion_fraction: number;
  default_serving_g: number | null;
}

export interface NutrientPanel {
  // Proximates
  water_g: number | null;
  energy_kcal: number;
  energy_kj: number | null;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  ash_g: number | null;

  // Fat sub-fractions
  saturated_fat_g: number | null;
  mufa_g: number | null;
  pufa_g: number | null;
  trans_fat_g: number | null;
  cholesterol_mg: number | null;

  // Carb sub-fractions
  starch_g: number | null;
  glycemic_index: number | null;

  // Minerals
  sodium_mg: number | null;
  potassium_mg: number | null;
  calcium_mg: number | null;
  iron_mg: number | null;
  magnesium_mg: number | null;
  phosphorus_mg: number | null;
  zinc_mg: number | null;
  copper_mg: number | null;
  manganese_mg: number | null;
  selenium_mcg: number | null;
  iodine_mcg: number | null;
  chromium_mcg: number | null;

  // Vitamins
  vit_a_mcg_rae: number | null;
  vit_d_mcg: number | null;
  vit_e_mg: number | null;
  vit_k_mcg: number | null;
  vit_c_mg: number | null;
  vit_b1_thiamin_mg: number | null;
  vit_b2_riboflavin_mg: number | null;
  vit_b3_niacin_mg: number | null;
  vit_b5_pantothenic_mg: number | null;
  vit_b6_pyridoxine_mg: number | null;
  vit_b7_biotin_mcg: number | null;
  vit_b9_folate_mcg: number | null;
  vit_b12_cobalamin_mcg: number | null;
  choline_mg: number | null;
}

export interface FoodDetail extends FoodSummary {
  nutrients: NutrientPanel;
  source_version: string;
  /** Derived health / suitability guidance (rules + AI summary). */
  health?: HealthSpec;
}

/** A condition this food is generally supportive for, with the nutrient why. */
export interface HealthCondition {
  /** Display label, e.g. "Blood-sugar control". */
  label: string;
  /** Short rationale, e.g. "high fibre, low glycemic index". */
  reason: string;
}

/**
 * Health & suitability profile, derived from the food's own nutrient panel
 * (transparent, evidence-based rules) plus a plain-language summary. This is
 * general nutrition information, NOT medical advice — never claims to cure,
 * treat, or prevent disease.
 */
export interface HealthSpec {
  /** One-line plain-language summary (AI-written when available, else composed). */
  summary: string;
  /** Conditions this food generally supports. */
  good_for: HealthCondition[];
  /** Notable nutrient strengths. */
  benefits: string[];
  /** Things to watch (sodium, saturated fat, sugar, glycemic index…). */
  cautions: string[];
  /** Always present — reinforces that this is informational only. */
  disclaimer: string;
}

/**
 * Input to the calculator. Either food_id (preferred) or a free-text query
 * (which the calculator resolves via FoodMasterService).
 *
 * quantity_g is always the AS-CONSUMED weight on the plate. If you pass
 * cooking_method, you're telling the engine "this was the cooking transform
 * applied to the canonical food I'm referencing". The engine handles raw↔cooked
 * weight conversion via cooking_methods.yield_factor.
 */
export interface CalculateInput {
  food_id?: string;
  food_query?: string;
  /** Grams of the food as consumed. Required. */
  quantity_g: number;
  /** Cooking method applied. Default 'raw'. */
  cooking_method?: CookingMethodCode;
  /**
   * Hint: was `quantity_g` measured before cooking (raw weight) or after?
   * Default 'as_consumed' (after). Use 'raw' only when caller has the
   * pre-cook weight.
   */
  quantity_state?: 'raw' | 'as_consumed';
  /** AI confidence if this calculation came from Plate Vision / Voice AI. */
  ai_confidence?: number;
}

export interface CalculateOutput {
  food: FoodSummary;
  cooking_method: CookingMethodCode;
  quantity_g_input: number;
  /** Weight after edible-portion + cooking-yield adjustments. */
  effective_weight_g: number;
  /** Grams of cooking oil added by the method. */
  oil_added_g: number;
  /** Final calculated nutrient panel (post-retention, scaled to plate weight). */
  nutrients: NutrientPanel;
  /** Where every value came from. */
  provenance: {
    engine_version: string;
    database_version: string;
    food_source: FoodSource;
    cooking_yield_factor: number | null;
    retention_factors_applied: Array<{ nutrient: string; factor: number }>;
    ai_confidence?: number;
  };
  /** UUID of the audit row written for this calculation. */
  audit_id: string;
}

/** Foods that don't match are flagged for human review instead of being faked. */
export interface UnresolvedFood {
  query: string;
  reason: 'no_match' | 'low_confidence' | 'ambiguous';
  candidate_food_ids: string[];
  recommended_action: 'manual_review_required';
}