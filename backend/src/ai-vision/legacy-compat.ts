import type { PlateAnalysis, PlateConfidence } from './plate-analysis.types';

/**
 * Backward-compatibility shim for the analyze response.
 *
 * WHY THIS EXISTS
 * ---------------
 * Plate Vision switched from engine-resolved items to a dish-level model
 * estimate, which changed the response vocabulary:
 *
 *   before                        after
 *   items[].detected_name    ->   items[].name
 *   items[].portion_g        ->   items[].grams
 *   items[].nutrients{...}   ->   items[].calories_kcal / protein_g / carbs_g
 *   totals.energy_kcal       ->   totals.calories_kcal
 *   totals.carbohydrate_g    ->   totals.carbs_g
 *   unresolved_count         ->   (gone - nothing is "unresolved" any more)
 *
 * The mobile app ships as an OTA JS bundle, so there is always a window where
 * an older bundle is talking to a newer server: an update is fetched on one
 * launch and applied on the NEXT one. Without this shim that window means
 * `NaN` calories and a nonsense "0 to review" chip on every installed phone.
 *
 * Emitting BOTH shapes removes the ordering constraint entirely — backend and
 * clients can deploy in either order, and an un-updated phone keeps working.
 * The two vocabularies were checked for key collisions: `protein_g`, `fat_g`
 * and `fiber_g` are shared and carry the same meaning and units, so they are
 * safe to merge into one object.
 *
 * WHEN TO DELETE THIS
 * -------------------
 * Once telemetry shows no client is still reading the legacy fields — i.e.
 * every install is past the OTA that introduced dish-level parsing. Delete
 * this file and the `withLegacyFields` call in the controller together.
 */

/** Dish-level confidence mapped onto the per-item 0..1 scale old clients expect. */
const CONFIDENCE_SCORE: Record<PlateConfidence, number> = {
  high: 0.9,
  medium: 0.65,
  low: 0.4,
};

interface LegacyItem {
  id: string;
  detected_name: string;
  alternates: string[];
  portion_g: number;
  cooking_method: string;
  ai_confidence: number;
  /**
   * Always true. Old clients treat `resolved: false` as "the engine could not
   * match this - show a warning and log it for manual review". On this path
   * every item does have numbers, so false would be actively misleading.
   */
  resolved: boolean;
  food: null;
  nutrients: {
    energy_kcal: number;
    protein_g: number;
    carbohydrate_g: number;
    fat_g: number;
    fiber_g: number | null;
  };
  audit_id: null;
}

export type LegacyCompatibleAnalysis = PlateAnalysis & {
  items: Array<PlateAnalysis['items'][number] & LegacyItem>;
  totals: PlateAnalysis['totals'] & {
    energy_kcal: number;
    carbohydrate_g: number;
  };
  unresolved_count: number;
  has_boxes: boolean;
};

/** Add the pre-dish-level field names alongside the current ones. */
export function withLegacyFields(analysis: PlateAnalysis): LegacyCompatibleAnalysis {
  const confidence = CONFIDENCE_SCORE[analysis.confidence] ?? 0.5;

  return {
    ...analysis,
    items: analysis.items.map((item, i) => ({
      ...item,
      id: `i_${i}`,
      detected_name: item.name,
      alternates: [],
      portion_g: item.grams,
      // The dish-level model does not report a cooking method per food. Empty
      // rather than a guessed 'raw', which old clients would render as fact.
      cooking_method: '',
      ai_confidence: confidence,
      resolved: true,
      food: null,
      nutrients: {
        energy_kcal: item.calories_kcal,
        protein_g: item.protein_g,
        carbohydrate_g: item.carbs_g,
        fat_g: item.fat_g,
        fiber_g: item.fiber_g,
      },
      audit_id: null,
    })),
    totals: {
      ...analysis.totals,
      energy_kcal: analysis.totals.calories_kcal,
      carbohydrate_g: analysis.totals.carbs_g,
    },
    unresolved_count: 0,
    // No bounding boxes on this path; old canvases skip their overlay layer.
    has_boxes: false,
  };
}
