/**
 * Plate Vision (Module 5) — analyze a meal photo, then log it.
 * Ported from the web plate-vision/clients APIs. The analyze call uploads the
 * image as multipart/form-data (Multer field name `image`).
 *
 * SDK 57's global fetch is WinterCG-compliant and rejects the legacy React
 * Native `{ uri, name, type }` FormData part ("Unsupported FormDataPart
 * implementation"), so we read the picked file into a real, typed Blob first.
 */
import { File } from 'expo-file-system';

import { api } from '@/lib/api';

export const MEAL_TYPES = [
  'breakfast',
  'lunch',
  'evening_snack',
  'dinner',
  'early_morning',
  'mid_morning',
  'evening_snack_1',
  'evening_snack_2',
  'mid_breakfast',
  'cleansing_water',
] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export type CookingMethodCode = string;

export interface DetectedItem {
  id: string;
  detected_name: string;
  alternates: string[];
  portion_g: number;
  cooking_method: CookingMethodCode;
  ai_confidence: number;
  resolved: boolean;
  food: { id: string; canonical_name: string; category: string } | null;
  nutrients: {
    energy_kcal: number;
    protein_g: number;
    carbohydrate_g: number;
    fat_g: number;
    fiber_g: number | null;
  } | null;
}

export interface VisionTotals {
  energy_kcal: number;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  fiber_g: number | null;
}

export interface VisionAnalysisResult {
  items: DetectedItem[];
  totals: VisionTotals;
  unresolved_count: number;
  ai_latency_ms: number;
  provenance: { engine_version: string; ai_model: string };
}

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
  source?: 'plate_vision' | 'voice' | 'manual';
  items: LogPlateItemInput[];
}

export interface PlateMeal {
  id: string;
  meal_type: MealType;
  logged_at: string;
  totals: VisionTotals;
  item_count: number;
}

/** A local image reference from expo-image-picker. */
export interface PickedImage {
  uri: string;
  name?: string;
  type?: string;
}

export const plateVisionApi = {
  analyze: async (img: PickedImage): Promise<VisionAnalysisResult> => {
    // Read the picked file into a real Blob with an explicit MIME type so the
    // WinterCG fetch can serialize the multipart part (the RN { uri } shape
    // throws "Unsupported FormDataPart implementation" on SDK 57 / RN 0.86).
    const bytes = await new File(img.uri).arrayBuffer();
    const blob = new Blob([new Uint8Array(bytes)], { type: img.type ?? 'image/jpeg' });
    const form = new FormData();
    form.append('image', blob, img.name ?? 'plate.jpg');
    return api.post<VisionAnalysisResult>('/api/v1/vision/analyze', { body: form });
  },
  log: (body: LogPlateInput) => api.post<PlateMeal>('/api/v1/me/plates', { body }),
};

/** Sensible default meal type from the clock (matches the web's mealTypeForNow). */
export function mealTypeForNow(): MealType {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 12) return 'mid_morning';
  if (h < 15) return 'lunch';
  if (h < 19) return 'evening_snack';
  return 'dinner';
}

export const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  evening_snack: 'Evening snack',
  dinner: 'Dinner',
  early_morning: 'Early morning',
  mid_morning: 'Mid-morning',
  evening_snack_1: 'Evening snack 1',
  evening_snack_2: 'Evening snack 2',
  mid_breakfast: 'Mid-breakfast',
  cleansing_water: 'Cleansing water',
};
