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

/** An extra nutrient the practice shows on every meal (beyond kcal/P/C/F/fibre). */
export interface NutrientColumn {
  key: string;
  label: string;
  unit: string;
  custom: boolean;
}

/** One of the practice's meal times, as its clients see it. */
export interface MealSlotEntry {
  slot: MealSlot;
  /** The practice's name for it, else the standard name. */
  label: string;
  custom: boolean;
}

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
  /** Macros in grams; null when not estimated/entered. */
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  /** Grams of dietary fibre; null when not recorded. */
  fiber_g?: number | null;
  /** The practice's extra nutrients for this portion, e.g. { sodium_mg: 320 }. */
  extra_nutrients?: Record<string, number>;
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
  /** Nutritionist's free-text guidance for the plan; shown on the PDF and to the client. */
  notes: string | null;
  /** The practice's names for meal times; missing slots use SLOT_LABELS. Older servers omit it. */
  slot_labels?: Partial<Record<MealSlot, string>>;
  /** The practice's meal times, in order. Older servers omit it. */
  meal_slots?: MealSlotEntry[];
  /** Labels and units for the cards' extra_nutrients. Older servers omit it. */
  nutrient_columns?: NutrientColumn[];
  cards?: MealCard[];
}

/** The name to show for a slot on this plan: the nutritionist's rename, else the standard name. */
export function slotLabel(plan: Pick<MealPlan, 'slot_labels'> | null | undefined, slot: MealSlot): string {
  return plan?.slot_labels?.[slot]?.trim() || SLOT_LABELS[slot] || slot;
}

export interface AddCardInput {
  dayNumber: number;
  mealType: MealSlot;
  mealName: string;
  description?: string;
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  extras?: Record<string, number>;
  ingredients?: string;
  instructions?: string;
  sourceType?: 'recipe' | 'food';
  sourceId?: string;
  quantity?: number;
  unit?: string;
}

/** A reusable free-typed meal from the workspace's history ("My foods"). */
export interface SavedMeal {
  meal_name: string;
  kcal: number;
  quantity: number | null;
  unit: string | null;
  description: string | null;
  ingredients: string | null;
}

export const mealPlansApi = {
  // Owner
  slots: () => api.get<{
    slots: MealSlot[];
    schedule?: MealSlotEntry[];
    nutrients?: NutrientColumn[];
    nutrientCatalogue?: Array<Omit<NutrientColumn, 'custom'>>;
    aiEnabled: boolean;
  }>('/api/v1/workspaces/me/meal-plans/slots'),
  /** Set the extra nutrient columns every meal in the practice shows. */
  setNutrients: (nutrients: Array<{ key?: string; label?: string; unit?: string }>) =>
    api.put<NutrientColumn[]>('/api/v1/workspaces/me/meal-plans/nutrients', { body: { nutrients } }),
  /** Set the practice's meal times and names; every client sees these. */
  setSchedule: (slots: Array<{ slot: MealSlot; label?: string }>) =>
    api.put<MealSlotEntry[]>('/api/v1/workspaces/me/meal-plans/slots', { body: { slots } }),
  savedMeals: (search?: string) =>
    api.get<SavedMeal[]>(`/api/v1/workspaces/me/meal-plans/saved-meals${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  list: (clientId: string) =>
    api.get<{ items: MealPlan[] }>(`/api/v1/workspaces/me/meal-plans?clientId=${encodeURIComponent(clientId)}`),
  get: (id: string) => api.get<MealPlan>(`/api/v1/workspaces/me/meal-plans/${id}`),
  create: (body: { clientId: string; startDate: string; weekNumber?: number }) =>
    api.post<MealPlan>('/api/v1/workspaces/me/meal-plans', { body }),
  setStatus: (id: string, status: PlanStatus) =>
    api.patch<MealPlan>(`/api/v1/workspaces/me/meal-plans/${id}/status`, { body: { status } }),
  updateNotes: (id: string, notes: string) =>
    api.patch<MealPlan>(`/api/v1/workspaces/me/meal-plans/${id}/notes`, { body: { notes } }),
  /** AI-estimate one meal's calories + macros for the whole portion. */
  estimateMacros: (body: {
    mealName: string; quantity?: number; unit?: string; ingredients?: string; description?: string;
    extras?: Array<{ key: string; label: string; unit: string }>;
  }) =>
    api.post<{ kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g?: number; extras?: Record<string, number> }>(
      '/api/v1/workspaces/me/meal-plans/estimate-macros', { body },
    ),
  /** Copy a week to a new start date; with `targetClientId`, to that client instead. */
  duplicate: (id: string, startDate: string, targetClientId?: string) =>
    api.post<MealPlan>(`/api/v1/workspaces/me/meal-plans/${id}/duplicate`, { body: { startDate, targetClientId } }),
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
