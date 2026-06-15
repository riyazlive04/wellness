import { api } from '@/lib/api';

/**
 * Plate Vision — Meal History + Insights + Review (Module 5).
 * Mirrors backend/src/plate-vision/plate-vision.types.ts.
 */

export type PlateReviewStatus = 'pending' | 'approved' | 'adjusted' | 'flagged';
export type PlateSource = 'plate_vision' | 'voice' | 'manual';
export type ItemResolutionStatus = 'resolved' | 'manual_review' | 'manual_entry';

export const MEAL_TYPES = [
  'breakfast', 'lunch', 'evening_snack', 'dinner', 'early_morning',
  'mid_morning', 'evening_snack_1', 'evening_snack_2', 'mid_breakfast',
  'cleansing_water',
] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export interface LogPlateItemInput {
  detected_name: string;
  food_id?: string;
  food_query?: string;
  quantity_g: number;
  cooking_method?: string;
  ai_confidence?: number;
}

export interface LogPlateInput {
  meal_type: MealType;
  photo_url?: string;
  notes?: string;
  logged_at?: string;
  source?: PlateSource;
  items: LogPlateItemInput[];
}

export interface PlateTotals {
  energy_kcal: number;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  fiber_g: number | null;
}

export interface PlateInsight {
  summary: string;
  macro_balance: { protein: string; carbohydrate: string; fat: string };
  suggestions: string[];
  flags: string[];
  score: number | null;
  source: 'ai' | 'rule';
}

export interface PlateItem {
  id: string;
  detected_name: string;
  food_id: string | null;
  food_name: string | null;
  quantity_g: number;
  cooking_method: string | null;
  resolution_status: ItemResolutionStatus;
  ai_confidence: number | null;
  nutrition: {
    energy_kcal: number;
    protein_g: number;
    carbohydrate_g: number;
    fat_g: number;
    fiber_g: number | null;
  } | null;
  audit_id: string | null;
}

export interface PlateMeal {
  id: string;
  client_id: string;
  workspace_id: string | null;
  meal_type: MealType;
  photo_url: string | null;
  notes: string | null;
  logged_at: string;
  source: PlateSource;
  totals: PlateTotals;
  item_count: number;
  resolved_count: number;
  ai_confidence: number | null;
  ai_model: string | null;
  engine_version: string | null;
  insight: PlateInsight | null;
  insight_generated_at: string | null;
  review_status: PlateReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  items?: PlateItem[];
}

export interface ReviewQueueItem extends PlateMeal {
  client_name: string | null;
}

export const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  evening_snack: 'Evening snack',
  dinner: 'Dinner',
  early_morning: 'Early morning',
  mid_morning: 'Mid morning',
  evening_snack_1: 'Evening snack 1',
  evening_snack_2: 'Evening snack 2',
  mid_breakfast: 'Mid breakfast',
  cleansing_water: 'Cleansing water',
};

export const REVIEW_STATUS_LABEL: Record<PlateReviewStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  adjusted: 'Adjusted',
  flagged: 'Flagged',
};

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const plateVisionApi = {
  // Client
  log: (body: LogPlateInput) => api.post<PlateMeal>('/api/v1/me/plates', { body }),
  listMine: (days = 14) => api.get<PlateMeal[]>(`/api/v1/me/plates${qs({ days })}`),
  getMine: (id: string) => api.get<PlateMeal>(`/api/v1/me/plates/${id}`),

  // Staff review
  reviewQueue: (params: { status?: PlateReviewStatus; limit?: number; offset?: number } = {}) =>
    api.get<ReviewQueueItem[]>(`/api/v1/workspaces/me/plates/review${qs(params)}`),
  getForReview: (id: string) => api.get<ReviewQueueItem>(`/api/v1/workspaces/me/plates/${id}`),
  review: (id: string, body: { status: 'approved' | 'adjusted' | 'flagged'; note?: string }) =>
    api.patch<ReviewQueueItem>(`/api/v1/workspaces/me/plates/${id}/review`, { body }),
};

/** Pick a sensible default meal_type from the current local hour. */
export function mealTypeForNow(date = new Date()): MealType {
  const h = date.getHours();
  if (h < 10) return 'breakfast';
  if (h < 12) return 'mid_morning';
  if (h < 15) return 'lunch';
  if (h < 19) return 'evening_snack';
  return 'dinner';
}
