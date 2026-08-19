/**
 * Plate Vision — dish-level AI analysis contract.
 *
 * ⚠️ READ THIS BEFORE TRUSTING ANY NUMBER IN HERE.
 *
 * Every nutrition value on this shape is ESTIMATED BY THE MODEL from a photo.
 * It is not looked up in IFCT 2017 / USDA FDC, it is not computed by
 * CalculatorService, and there is no `audit_id` to re-derive it from. The same
 * photo can produce different numbers on a second call.
 *
 * That is a deliberate product decision (dish-level recognition beats
 * per-ingredient matching for mixed and regional dishes, and it never dead-ends
 * a user on "we couldn't match this food"). The cost is that these numbers are
 * indicative, not clinical. Anything that renders them — especially the
 * nutritionist review queue — must say so.
 *
 * The deterministic engine still owns voice, barcode, meal-plan and manual
 * entry. It was not removed; it is simply not on this path. Items logged from
 * here carry `resolution_status = 'ai_estimated'` so the two are always
 * distinguishable in `meal_logs`.
 */

export type PlateConfidence = 'high' | 'medium' | 'low';

/** Where a plate's numbers came from. Persisted, so history stays readable. */
export type NutritionSource = 'ai_estimate' | 'engine';

/**
 * One food on the plate. `grams` is the model's visual portion estimate; every
 * other number is its nutrition estimate FOR THAT PORTION — so editing grams
 * means scaling the rest linearly (see scaleAnalyzedItem).
 */
export interface AnalyzedItem {
  name: string;
  /** Human-readable portion, e.g. "1 medium bowl", "2 rotis". */
  estimated_portion: string;
  grams: number;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
}

export interface AnalysisTotals {
  calories_kcal: number;
  /**
   * The model's own uncertainty band. Widens when confidence is low or the
   * portion is ambiguous — the honest alternative to a single fake-precise
   * number.
   */
  calories_range: { min: number; max: number };
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
}

/** A dish the model seriously considered and ruled out, for one-tap correction. */
export interface PlateAlternative {
  dish_name: string;
  /** One line on what would distinguish it from the chosen dish. */
  note: string;
}

export interface PlateAnalysis {
  dish_name: string;
  cuisine: string;
  confidence: PlateConfidence;
  alternatives: PlateAlternative[];
  /** Invisible ingredients the model assumed: cooking oil, ghee, sugar in sauces. */
  assumptions: string[];
  items: AnalyzedItem[];
  totals: AnalysisTotals;
  health_notes: string[];
  /** True when the photo has no food in it. All arrays are empty when set. */
  not_food: boolean;

  provenance: {
    ai_model: string;
    /** Always 'ai_estimate' on this path. Present so clients never have to guess. */
    nutrition_source: NutritionSource;
  };
  ai_latency_ms: number;
}

/** Optional user-supplied context that measurably sharpens the estimate. */
export interface AnalyzeHints {
  /** Free text, e.g. "cooked in ghee, 2 rotis". */
  hint?: string;
  /** Serving size relative to typical. Applies a measured gram multiplier. */
  portion?: 'small' | 'medium' | 'large';
  /** A spoon/hand/card is in frame and can calibrate scale. */
  scale_ref?: boolean;
  /** The user rejected the previous identification and says it is this instead. */
  correction?: string;
}

export const EMPTY_TOTALS: AnalysisTotals = {
  calories_kcal: 0,
  calories_range: { min: 0, max: 0 },
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
  sugar_g: 0,
  sodium_mg: 0,
};
