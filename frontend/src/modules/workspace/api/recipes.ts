import { api } from '@/lib/api';
import type {
  CookingMethodCode,
  FoodSummary,
  NutrientPanel,
} from './nutrition';

// ─── Types — mirror backend/src/workspace-recipes/workspace-recipes.types.ts

export interface RecipeListItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  servings: number;
  yield_factor: number;
  is_published: boolean;
  ingredient_count: number;
  /** Fast SQL estimate (yield/retention/oil NOT applied). Detail page has the exact number. */
  kcal_per_serving_estimate: number | null;
  /** Per-serving macros in grams — computed from ingredients, or AI-estimated when none. */
  protein_g_per_serving: number | null;
  carbs_g_per_serving: number | null;
  fat_g_per_serving: number | null;
  /** true when the numbers are an AI estimate rather than computed from ingredients. */
  nutrition_estimated: boolean;
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
  nutrition: NutrientPanel;
  effective_weight_g: number;
  oil_added_g: number;
}

export interface RecipeNutritionTotals {
  total_ingredient_weight_g: number;
  final_cooked_weight_g: number;
  per_recipe: NutrientPanel;
  per_serving: NutrientPanel;
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

export interface UpsertRecipeIngredientInput {
  food_id: string;
  quantity_g: number;
  cooking_method?: CookingMethodCode;
  quantity_state?: 'raw' | 'as_consumed';
  sort_order?: number;
  notes?: string | null;
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
  ingredients?: UpsertRecipeIngredientInput[];
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

export const recipesApi = {
  list: (params: { search?: string; includeDrafts?: boolean } = {}) =>
    api.get<RecipeListItem[]>(`/api/v1/workspaces/me/recipes${qs(params)}`),

  get: (id: string) =>
    api.get<RecipeWithComputedNutrition>(`/api/v1/workspaces/me/recipes/${id}`),

  create: (body: CreateRecipeInput) =>
    api.post<RecipeWithComputedNutrition>('/api/v1/workspaces/me/recipes', { body }),

  update: (id: string, body: UpdateRecipeInput) =>
    api.patch<RecipeWithComputedNutrition>(`/api/v1/workspaces/me/recipes/${id}`, { body }),

  remove: (id: string) =>
    api.delete<{ id: string }>(`/api/v1/workspaces/me/recipes/${id}`),

  bulkImport: (names: string[]) =>
    api.post<BulkImportResult>('/api/v1/workspaces/me/recipes/bulk-import', { body: { names } }),

  /** Publish all drafts (or unpublish all) in one action. */
  bulkPublish: (body: { publish?: boolean; onlyWithIngredients?: boolean } = {}) =>
    api.post<{ updated: number }>('/api/v1/workspaces/me/recipes/bulk-publish', { body }),
};

export interface BulkImportResult {
  total: number;
  /** New draft recipes created. */
  created: number;
  /** Existing same-name recipes that were removed and replaced. */
  replaced: number;
}
