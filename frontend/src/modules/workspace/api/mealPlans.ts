import { api } from '@/lib/api';

// ──────────────────────────────────────────────────────────────────
// Types — kept in sync with backend/src/meal-plans/meal-plans.types.ts
// ──────────────────────────────────────────────────────────────────

/** Mirrors the meal_type Postgres enum. Order here is the order shown in a day. */
export const MEAL_SLOTS = [
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
] as const;

export type MealSlot = (typeof MEAL_SLOTS)[number];
export type PlanStatus = 'draft' | 'published';

/** Human labels — the enum keys are not presentable. */
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

/** The slots a typical plan uses — the rest are opt-in extras. */
export const DEFAULT_SLOTS: MealSlot[] = ['breakfast', 'mid_morning', 'lunch', 'evening_snack', 'dinner'];

export const DAY_LABELS = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];

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
  source_type: 'recipe' | 'food' | null;
  source_id: string | null;
  /** NUMERIC column — the unit carries the words ("katori", "g"). */
  quantity: number | null;
  unit: string | null;
}

export interface MealPlan {
  id: string;
  workspace_id: string;
  client_id: string;
  week_number: number;
  start_date: string;
  end_date: string;
  status: PlanStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  /** Summed from the cards server-side. */
  total_kcal: number;
  cards?: MealCard[];
}

export interface AddCardInput {
  dayNumber: number;
  mealType: MealSlot;
  mealName: string;
  description?: string;
  kcal?: number;
  ingredients?: string;
  instructions?: string;
  sourceType?: 'recipe' | 'food';
  sourceId?: string;
  quantity?: number;
  unit?: string;
}

export const mealPlansApi = {
  // Owner
  slots: () => api.get<{ slots: MealSlot[]; aiEnabled: boolean }>('/api/v1/workspaces/me/meal-plans/slots'),
  list: (clientId: string) =>
    api.get<{ items: MealPlan[] }>(`/api/v1/workspaces/me/meal-plans?clientId=${encodeURIComponent(clientId)}`),
  get: (id: string) => api.get<MealPlan>(`/api/v1/workspaces/me/meal-plans/${id}`),
  create: (body: { clientId: string; startDate: string; weekNumber?: number }) =>
    api.post<MealPlan>('/api/v1/workspaces/me/meal-plans', { body }),
  setStatus: (id: string, status: PlanStatus) =>
    api.patch<MealPlan>(`/api/v1/workspaces/me/meal-plans/${id}/status`, { body: { status } }),
  duplicate: (id: string, startDate: string) =>
    api.post<MealPlan>(`/api/v1/workspaces/me/meal-plans/${id}/duplicate`, { body: { startDate } }),
  remove: (id: string) => api.delete<{ deleted: true }>(`/api/v1/workspaces/me/meal-plans/${id}`),

  addCard: (planId: string, body: AddCardInput) =>
    api.post<MealCard>(`/api/v1/workspaces/me/meal-plans/${planId}/cards`, { body }),
  updateCard: (planId: string, cardId: string, body: Partial<AddCardInput>) =>
    api.patch<MealCard>(`/api/v1/workspaces/me/meal-plans/${planId}/cards/${cardId}`, { body }),
  removeCard: (planId: string, cardId: string) =>
    api.delete<{ deleted: true }>(`/api/v1/workspaces/me/meal-plans/${planId}/cards/${cardId}`),

  /** Drafts a week with AI. Always returns DRAFT cards for the nutritionist to edit. */
  generate: (planId: string, body: { slots: MealSlot[]; notes?: string; replace?: boolean }) =>
    api.post<MealPlan>(`/api/v1/workspaces/me/meal-plans/${planId}/generate`, { body }),

  // Client
  myCurrent: () => api.get<MealPlan | null>('/api/v1/me/meal-plan'),
  myHistory: () => api.get<{ items: MealPlan[] }>('/api/v1/me/meal-plan/history'),
};

/** Group cards into day → slot → card for grid rendering. */
export function cardsByDay(cards: MealCard[] = []): Map<number, MealCard[]> {
  const map = new Map<number, MealCard[]>();
  for (const c of cards) {
    const list = map.get(c.day_number) ?? [];
    list.push(c);
    map.set(c.day_number, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => MEAL_SLOTS.indexOf(a.meal_type) - MEAL_SLOTS.indexOf(b.meal_type));
  }
  return map;
}

/** Calendar date for day N of a plan, so the grid can show real dates. */
export function dayDate(startDate: string, dayNumber: number): Date {
  const d = new Date(`${startDate}T00:00:00`);
  d.setDate(d.getDate() + (dayNumber - 1));
  return d;
}
