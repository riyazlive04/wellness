/**
 * Workspace recipe types — internal contracts.
 *
 * The recipe API computes nutrition LIVE on every read by summing per-
 * ingredient panels from the NutritionEngine calculator. No frozen snapshot.
 * This means edits to the foods library (or admin corrections) propagate
 * immediately to every recipe that references them.
 *
 * Frontend mirrors these shapes in frontend/src/modules/workspace/api/recipes.ts.
 */
import type {
  CookingMethodCode,
  FoodSummary,
  NutrientPanel,
} from '../nutrition-engine/nutrition.types';

export interface RecipeListItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  servings: number;
  yield_factor: number;
  is_published: boolean;
  ingredient_count: number;
  /**
   * Approximate kcal per serving. Computed via SQL aggregation (raw kcal × g / 100),
   * NOT through the calculator — yield + retention + oil are NOT applied.
   * Use the detail page for the exact value. null when ingredient_count is 0.
   */
  kcal_per_serving_estimate: number | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredientRow {
  id: string;
  food_id: string;
  food: FoodSummary;
  quantity_g: number;
  cooking_method: CookingMethodCode;
  quantity_state: 'raw' | 'as_consumed';
  sort_order: number;
  notes: string | null;
  /** Per-ingredient computed nutrition (post yield/retention/scale). */
  nutrition: NutrientPanel;
  effective_weight_g: number;
  oil_added_g: number;
}

export interface RecipeNutritionTotals {
  /** Sum of edible weights of all ingredients, post cooking yield + edible portion. */
  total_ingredient_weight_g: number;
  /** Final cooked weight after applying the recipe-level yield_factor. */
  final_cooked_weight_g: number;
  /** Nutrient panel for the WHOLE recipe (all servings). */
  per_recipe: NutrientPanel;
  /** Per-serving panel = per_recipe / servings. */
  per_serving: NutrientPanel;
  /** Per-100g of cooked recipe — null if cooked weight is 0. */
  per_100g_cooked: NutrientPanel | null;
}

export interface RecipeWithComputedNutrition {
  recipe: {
    id: string;
    workspace_id: string;
    created_by_user_id: string | null;
    name: string;
    description: string | null;
    category: string | null;
    servings: number;
    yield_factor: number;
    instructions: string | null;
    notes: string | null;
    is_published: boolean;
    created_at: string;
    updated_at: string;
  };
  ingredients: RecipeIngredientRow[];
  totals: RecipeNutritionTotals;
  meta: {
    engine_version: string;
    database_version: string;
    computed_at: string;
  };
}

export interface CreateRecipeInput {
  name: string;
  description?: string | null;
  category?: string | null;
  servings?: number;
  yield_factor?: number;
  instructions?: string | null;
  notes?: string | null;
  is_published?: boolean;
  ingredients: UpsertRecipeIngredientInput[];
}

export interface UpdateRecipeInput {
  name?: string;
  description?: string | null;
  category?: string | null;
  servings?: number;
  yield_factor?: number;
  instructions?: string | null;
  notes?: string | null;
  is_published?: boolean;
  /** If provided, REPLACES the entire ingredient list. */
  ingredients?: UpsertRecipeIngredientInput[];
}

export interface UpsertRecipeIngredientInput {
  food_id: string;
  quantity_g: number;
  cooking_method?: CookingMethodCode;
  quantity_state?: 'raw' | 'as_consumed';
  sort_order?: number;
  notes?: string | null;
}
