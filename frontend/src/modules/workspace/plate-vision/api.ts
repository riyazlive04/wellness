import { api } from '@/lib/api';
import type { DetectedItem, NutritionMacros } from './types';

/**
 * Adapter between the Plate Vision analyze endpoint and this module's canvas
 * UI, which predates the current API and speaks its own vocabulary
 * (portionG / macros / box).
 *
 * ⚠️ The nutrition here is the model's ESTIMATE from the photo, not an
 * IFCT/USDA lookup — `source` is reported as 'AI' so the item cards say so
 * rather than implying a database row.
 */

/** Raw dish-level shape returned by POST /api/v1/vision/analyze. */
interface RawAnalysis {
  dish_name: string;
  cuisine: string;
  confidence: 'high' | 'medium' | 'low';
  items: Array<{
    name: string;
    estimated_portion: string;
    grams: number;
    calories_kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
  }>;
  totals: {
    calories_kcal: number;
    calories_range: { min: number; max: number };
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
  };
  not_food: boolean;
  ai_latency_ms: number;
}

export interface AnalyzeResponse {
  items: DetectedItem[];
  totalMacros: NutritionMacros;
  latencyMs: number;
  /** Dish-level identification, shown above the item list. */
  dishName: string;
  cuisine: string;
  /** The model's calorie uncertainty band — show it next to the total. */
  caloriesRange: { min: number; max: number };
  /**
   * False on this path: the dish-level model returns no bounding boxes, so the
   * canvas falls back to a plain image with no overlays.
   */
  hasBoxes: boolean;
}

/** Dish-level confidence, spread onto each item so the cards can show a number. */
const CONFIDENCE_SCORE = { high: 0.9, medium: 0.65, low: 0.4 } as const;

/** POST an image File (or Blob) to the backend Plate Vision analyzer. */
export async function analyzePlate(image: File | Blob): Promise<AnalyzeResponse> {
  const fd = new FormData();
  const filename = image instanceof File ? image.name : `plate.${extFor(image.type)}`;
  fd.append('image', image, filename);
  const raw = await api.post<RawAnalysis>('/api/v1/vision/analyze', { body: fd });

  return {
    items: raw.items.map((it, i) => ({
      // The analysis has no stable ids of its own; index is enough for a list
      // that is rebuilt on every scan.
      id: `item-${i}`,
      name: it.name,
      portionG: it.grams,
      confidence: CONFIDENCE_SCORE[raw.confidence] ?? 0.5,
      source: 'AI',
      macros: {
        calories: it.calories_kcal,
        protein: it.protein_g,
        carbs: it.carbs_g,
        fat: it.fat_g,
        fiber: it.fiber_g,
      },
      // No boxes on this path. Zeroed rather than omitted so the canvas can
      // keep rendering the shape it expects without null checks everywhere.
      box: { x: 0, y: 0, w: 0, h: 0 },
    })),
    totalMacros: {
      calories: raw.totals.calories_kcal,
      protein: raw.totals.protein_g,
      carbs: raw.totals.carbs_g,
      fat: raw.totals.fat_g,
      fiber: raw.totals.fiber_g,
    },
    latencyMs: raw.ai_latency_ms,
    dishName: raw.dish_name,
    cuisine: raw.cuisine,
    caloriesRange: raw.totals.calories_range,
    hasBoxes: false,
  };
}

function extFor(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png'))  return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('heic')) return 'heic';
  return 'bin';
}
