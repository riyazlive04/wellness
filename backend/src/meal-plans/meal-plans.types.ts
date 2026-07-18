/**
 * Weekly meal planner types.
 *
 * Backed by the pre-existing `weekly_plans` + `meal_cards` tables, which were
 * already workspace-keyed but never wired up (0 rows). Nothing is migrated —
 * this is the first code to write to them.
 */

/** Slots a day can hold. Mirrors the `meal_type` Postgres enum exactly. */
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

/** draft → only the nutritionist sees it. published → the client sees it. */
export type PlanStatus = 'draft' | 'published';

export interface MealCard {
  id: string;
  plan_id: string;
  /** 1 = first day of the plan week … 7 = last. */
  day_number: number;
  meal_type: MealSlot;
  meal_name: string;
  description: string | null;
  kcal: number;
  ingredients: string | null;
  instructions: string | null;
  /** Set when the card came from the library rather than free text. */
  source_type: 'recipe' | 'food' | null;
  source_id: string | null;
  /**
   * NUMERIC in Postgres — always read back via `::float8` so Prisma hands us a
   * JS number rather than a Decimal (which JSON-serializes to {s,e,d} garbage).
   */
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
  /**
   * Summed from meal_cards at read time rather than stored. The legacy
   * `weekly_plans.total_kcal` column drifts the moment a card changes, so it is
   * deliberately not the source of truth.
   */
  total_kcal: number;
  /** Only present on single-plan reads. */
  cards?: MealCard[];
}

export interface MealPlanWithClient extends MealPlan {
  client_name: string;
}
