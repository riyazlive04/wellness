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

/** Standard names, used when a practice hasn't renamed a meal time. */
export const STANDARD_SLOT_LABELS: Record<MealSlot, string> = {
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

/** The meal times a practice uses until it changes them. */
export const DEFAULT_SCHEDULE: MealSlot[] = ['breakfast', 'mid_morning', 'lunch', 'evening_snack', 'dinner'];

/** One of a practice's meal times, as its clients see it. */
export interface MealSlotEntry {
  slot: MealSlot;
  /** The practice's name for it, else the standard name. */
  label: string;
  /** True when the practice renamed it. */
  custom: boolean;
}

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
  /** Macros in grams; null when not estimated/entered. */
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
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

/**
 * A distinct free-typed meal the workspace has used before — the reusable
 * "My foods" list. Derived from meal_cards (source_type IS NULL), latest values
 * per name; carries no source link so picking it just prefills an editable copy.
 */
export interface SavedMeal {
  meal_name: string;
  kcal: number;
  quantity: number | null;
  unit: string | null;
  description: string | null;
  ingredients: string | null;
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
  /** Nutritionist's free-text guidance for the whole plan; shown on the PDF and to the client. */
  notes: string | null;
  /**
   * Names for meal-time rows, keyed by slot, e.g. { breakfast: 'First Meal' }:
   * the practice's names (see MealSlotsService). Missing slots use the
   * standard name. Kept as a map so older app versions can read it.
   */
  slot_labels: Partial<Record<MealSlot, string>>;
  /** The practice's meal times, in order. Slots that hold meals but aren't listed still show. */
  meal_slots?: MealSlotEntry[];
  /** Only present on single-plan reads. */
  cards?: MealCard[];
}

export interface MealPlanWithClient extends MealPlan {
  client_name: string;
}
