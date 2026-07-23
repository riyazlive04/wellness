/** Client meal plan (the plan the nutritionist prescribes). Ported from the web
 *  mealPlansApi — the client only reads its current plan. */
import { api } from '@/lib/api';

export type MealSlot =
  | 'cleansing_water'
  | 'early_morning'
  | 'breakfast'
  | 'mid_breakfast'
  | 'mid_morning'
  | 'lunch'
  | 'evening_snack'
  | 'evening_snack_1'
  | 'evening_snack_2'
  | 'dinner';

export const SLOT_LABELS: Record<MealSlot, string> = {
  cleansing_water: 'Cleansing water',
  early_morning: 'Early morning',
  breakfast: 'Breakfast',
  mid_breakfast: 'Mid-breakfast',
  mid_morning: 'Mid-morning',
  lunch: 'Lunch',
  evening_snack: 'Evening snack',
  evening_snack_1: 'Evening snack 1',
  evening_snack_2: 'Evening snack 2',
  dinner: 'Dinner',
};

/** Order slots appear within a day. */
export const SLOT_ORDER: MealSlot[] = [
  'cleansing_water',
  'early_morning',
  'breakfast',
  'mid_breakfast',
  'mid_morning',
  'lunch',
  'evening_snack',
  'evening_snack_1',
  'evening_snack_2',
  'dinner',
];

export interface MealCard {
  id: string;
  plan_id: string;
  day_number: number;
  meal_type: MealSlot;
  meal_name: string;
  description: string | null;
  kcal: number;
  ingredients: string | null;
  instructions: string | null;
  quantity: number | null;
  unit: string | null;
}

export interface MealPlan {
  id: string;
  week_number: number;
  start_date: string;
  end_date: string;
  status: string;
  published_at: string | null;
  total_kcal: number;
  cards?: MealCard[];
}

export const mealPlansApi = {
  myCurrent: () => api.get<MealPlan | null>('/api/v1/me/meal-plan'),
};
