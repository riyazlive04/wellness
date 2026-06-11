import { api } from '@/lib/api';

// ─── Types — mirror backend/src/nutrition-engine/nutrition.types.ts ────

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
  water_g: number | null;
  energy_kcal: number;
  energy_kj: number | null;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  ash_g: number | null;
  saturated_fat_g: number | null;
  mufa_g: number | null;
  pufa_g: number | null;
  trans_fat_g: number | null;
  cholesterol_mg: number | null;
  starch_g: number | null;
  glycemic_index: number | null;
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
}

export interface FoodSearchHit {
  food: FoodSummary;
  similarity: number;
}

export interface CalculateInput {
  food_id?: string;
  food_query?: string;
  quantity_g: number;
  cooking_method?: CookingMethodCode;
  quantity_state?: 'raw' | 'as_consumed';
}

export interface CalculateOutput {
  food: FoodSummary;
  cooking_method: CookingMethodCode;
  quantity_g_input: number;
  effective_weight_g: number;
  oil_added_g: number;
  nutrients: NutrientPanel;
  provenance: {
    engine_version: string;
    database_version: string;
    food_source: FoodSource;
    cooking_yield_factor: number | null;
    retention_factors_applied: Array<{ nutrient: string; factor: number }>;
  };
  audit_id: string;
}

// ─── API ───────────────────────────────────────────────────────────────

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const nutritionApi = {
  searchFoods: (params: { q?: string; lang?: string; category?: string; limit?: number } = {}) =>
    api.get<FoodSearchHit[]>(`/api/v1/nutrition/foods/search${qs(params)}`),

  getFood: (id: string) =>
    api.get<FoodDetail>(`/api/v1/nutrition/foods/${id}`),

  calculate: (body: CalculateInput) =>
    api.post<CalculateOutput>('/api/v1/nutrition/calculate', { body }),

  getAudit: (id: string) =>
    api.get<{
      id: string;
      target_type: string;
      target_id: string | null;
      food_id: string | null;
      inputs: unknown;
      outputs: unknown;
      engine_version: string;
      database_version: string;
      created_at: string;
    }>(`/api/v1/nutrition/audit/${id}`),
};

// ─── Display helpers ───────────────────────────────────────────────────

export const CATEGORY_LABEL: Record<FoodCategory, string> = {
  cereals:           'Cereals & Millets',
  pulses:            'Pulses & Legumes',
  leafy_vegetables:  'Leafy vegetables',
  roots_tubers:      'Roots & Tubers',
  other_vegetables:  'Vegetables',
  fruits:            'Fruits',
  milk_products:     'Milk & Dairy',
  meat:              'Meat',
  poultry:           'Poultry',
  fish_seafood:      'Fish & Seafood',
  eggs:              'Eggs',
  fats_oils:         'Fats & Oils',
  sugars:            'Sugars',
  beverages:         'Beverages',
  condiments_spices: 'Spices',
  nuts_seeds:        'Nuts & Seeds',
  cooked_dishes:     'Cooked Dishes',
  baked_goods:       'Baked Goods',
  fast_food:         'Fast Food',
  misc:              'Other',
};

export const CATEGORY_LIST: FoodCategory[] = Object.keys(CATEGORY_LABEL) as FoodCategory[];

export const COOKING_METHOD_LABEL: Record<CookingMethodCode, string> = {
  raw:             'Raw',
  boiled:          'Boiled',
  steamed:         'Steamed',
  grilled:         'Grilled',
  roasted:         'Roasted',
  baked:           'Baked',
  sauteed:         'Sautéed',
  pan_fried:       'Pan-fried',
  deep_fried:      'Deep-fried',
  stir_fried:      'Stir-fried',
  curried:         'Curried',
  tandoor:         'Tandoor',
  pressure_cooked: 'Pressure-cooked',
  microwaved:      'Microwaved',
  fermented:       'Fermented',
};
