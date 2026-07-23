/** Food lookup — the IFCT 2017 nutrition database. Ported subset of the web
 *  nutritionApi (search + detail); client-readable public nutrition endpoints. */
import { api } from '@/lib/api';

export interface FoodSummary {
  id: string;
  canonical_name: string;
  category: string;
  default_serving_g: number | null;
}

export interface MacroSummary {
  protein_g: number | null;
  carbohydrate_g: number | null;
  fat_g: number | null;
}

export interface FoodSearchHit {
  food: FoodSummary;
  similarity: number;
  energy_kcal_per_100g: number | null;
  macros?: MacroSummary;
  good_for?: string[];
}

/** A subset of the full NutrientPanel — the values we surface on mobile. */
export interface FoodNutrients {
  energy_kcal: number;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  calcium_mg: number | null;
  iron_mg: number | null;
  vit_c_mg: number | null;
}

export interface FoodDetail extends FoodSummary {
  nutrients: FoodNutrients;
  health?: { summary: string; benefits: string[]; cautions: string[] };
}

function qs(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export const nutritionApi = {
  searchFoods: (params: { q?: string; category?: string; limit?: number } = {}) =>
    api.get<FoodSearchHit[]>(`/api/v1/nutrition/foods/search${qs(params)}`),
  foodDetail: (id: string) => api.get<FoodDetail>(`/api/v1/nutrition/foods/${id}`),
};
