import type { NutrientPanel } from '../nutrition-engine/nutrition.types';

/**
 * Plate Vision — Meal History + Insights + Review (Module 5).
 *
 * The analyze step (ai-vision) recognises foods and routes them through the
 * deterministic engine. THIS layer persists an analyzed plate as a meal
 * session, freezes the engine's numbers, attaches a goal-based AI insight that
 * only INTERPRETS those numbers, and exposes the nutritionist review flow.
 */

export type PlateReviewStatus = 'pending' | 'approved' | 'adjusted' | 'flagged';
export type PlateSource = 'plate_vision' | 'voice' | 'manual';
/**
 * How an item's numbers were produced.
 *   resolved      — engine computed them from an IFCT/USDA row (audit_id present)
 *   ai_estimated  — the vision model estimated them from the photo (no audit_id)
 *   manual_review — AI saw the food, engine could not resolve it, no numbers
 *   manual_entry  — a human typed it
 */
export type ItemResolutionStatus =
  | 'resolved'
  | 'ai_estimated'
  | 'manual_review'
  | 'manual_entry';

/** Where a plate's totals came from. Persisted so history stays interpretable. */
export type NutritionSource = 'engine' | 'ai_estimate';

/** The meal_type enum values from the DB (public.meal_type). */
export const MEAL_TYPES = [
  'breakfast', 'lunch', 'evening_snack', 'dinner', 'early_morning',
  'mid_morning', 'evening_snack_1', 'evening_snack_2', 'mid_breakfast',
  'cleansing_water',
] as const;
export type MealType = (typeof MEAL_TYPES)[number];

// ─── Inputs ──────────────────────────────────────────────────────────

/**
 * Nutrition the vision model estimated for THIS portion. Only read when the
 * plate is logged with nutrition_source 'ai_estimate'.
 *
 * ⚠️ These arrive from the client, so they are bounded and re-totalled
 * server-side (see logPlate). Unlike engine-computed numbers they cannot be
 * verified — a client could in principle post whatever it likes for its own
 * history. That is a real weakening versus the engine path, mitigated by the
 * fact that clients already chose the food and the grams, and by the plate
 * being marked ai_estimated everywhere a nutritionist sees it.
 */
export interface AiItemNutrition {
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
}

export interface LogPlateItemInput {
  detected_name: string;
  /** Resolved IFCT/USDA food id (engine path only). */
  food_id?: string;
  /** Free-text fallback when the user typed/overrode a food name. */
  food_query?: string;
  quantity_g: number;
  cooking_method?: string;
  ai_confidence?: number;
  /** Model-estimated nutrition. Required on the ai_estimate path. */
  nutrition?: AiItemNutrition;
}

/** Dish-level context from the analyze step. Frozen onto the plate row. */
export interface PlateAnalysisContext {
  dish_name?: string;
  cuisine?: string;
  confidence?: 'high' | 'medium' | 'low';
  alternatives?: { dish_name: string; note?: string }[];
  assumptions?: string[];
  health_notes?: string[];
  calories_range?: { min: number; max: number };
}

export interface LogPlateInput {
  /** Validated against MEAL_TYPES at the service boundary. */
  meal_type: string;
  photo_url?: string;
  notes?: string;
  /** ISO timestamp the meal happened. Defaults to now. */
  logged_at?: string;
  source?: PlateSource;
  /**
   * Defaults to 'engine' so any existing caller keeps its old behaviour. The
   * plate path sends 'ai_estimate'.
   */
  nutrition_source?: NutritionSource;
  /** Dish-level analysis context. Only meaningful on the ai_estimate path. */
  analysis?: PlateAnalysisContext;
  items: LogPlateItemInput[];
}

export interface ReviewInput {
  status: 'approved' | 'adjusted' | 'flagged';
  note?: string;
}

// ─── Outputs ─────────────────────────────────────────────────────────

export interface PlateTotals {
  energy_kcal: number;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  fiber_g: number | null;
}

export interface PlateItem {
  /** The meal_logs row id. */
  id: string;
  detected_name: string;
  food_id: string | null;
  food_name: string | null;
  quantity_g: number;
  cooking_method: string | null;
  resolution_status: ItemResolutionStatus;
  ai_confidence: number | null;
  /** Frozen NutrientPanel snapshot, null for unresolved items. */
  nutrition: NutrientPanel | null;
  audit_id: string | null;
}

/**
 * Goal-based interpretation of the (already-computed) plate totals. The
 * generator NEVER changes or invents nutrition numbers — it reads the engine's
 * output and the client's goal, and explains it.
 */
export interface PlateInsight {
  summary: string;
  macro_balance: {
    protein: string;
    carbohydrate: string;
    fat: string;
  };
  suggestions: string[];
  flags: string[];
  /** 0..100 quality/adherence score, or null if not computed. */
  score: number | null;
  /** 'ai' = Gemini-generated, 'rule' = deterministic fallback. */
  source: 'ai' | 'rule';
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
  /** 'engine' = reproducible via audit_id; 'ai_estimate' = model's guess. */
  nutrition_source: NutritionSource;
  /** Dish-level AI context. Null on engine-sourced plates. */
  analysis: PlateAnalysisContext | null;
  insight: PlateInsight | null;
  insight_generated_at: string | null;
  review_status: PlateReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  /** Populated on detail + log responses; omitted from list views. */
  items?: PlateItem[];
}

export interface ReviewQueueItem extends PlateMeal {
  client_name: string | null;
}

/** Client goal context fed to the insight generator. */
export interface ClientGoalContext {
  target_kcal: number | null;
  goals: string | null;
  activity_level: string | null;
}
