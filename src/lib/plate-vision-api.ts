/**
 * Plate Vision (Module 5) — analyze a meal photo, then log it.
 * Ported from the web plate-vision/clients APIs. The analyze call uploads the
 * image as multipart/form-data (Multer field name `image`).
 *
 * SDK 57's global fetch is WinterCG-compliant and can't serialize any React
 * Native file part ("Unsupported FormDataPart implementation"), so the upload
 * goes through Expo's NATIVE multipart uploader (FileSystem.uploadAsync)
 * instead of JS fetch/FormData.
 */
import * as FileSystem from 'expo-file-system/legacy';

import { api, resolveApiBase } from '@/lib/api';
import { supabase } from '@/lib/supabase';

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

/**
 * Engine-shaped totals, as stored on a logged plate. Distinct from
 * AnalysisTotals: this is what comes BACK from the server after logging, in the
 * NutrientPanel vocabulary the rest of the app renders.
 */
export interface VisionTotals {
  energy_kcal: number;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  fiber_g: number | null;
}

/**
 * One food the model read off the plate.
 *
 * ⚠️ Every number here is the model's ESTIMATE from the photo — not an
 * IFCT/USDA lookup, no audit trail, not reproducible between scans. Show the
 * calorie range alongside totals and never present these as measured.
 */
export interface AnalyzedItem {
  name: string;
  /** Human-readable portion, e.g. "1 medium bowl". */
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
  /** The model's own uncertainty band. Widens when it is unsure. */
  calories_range: { min: number; max: number };
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
}

export interface PlateAlternative {
  dish_name: string;
  note: string;
}

export interface PlateAnalysis {
  dish_name: string;
  cuisine: string;
  confidence: 'high' | 'medium' | 'low';
  /** Dishes the model ruled out — offer as one-tap corrections. */
  alternatives: PlateAlternative[];
  assumptions: string[];
  items: AnalyzedItem[];
  totals: AnalysisTotals;
  health_notes: string[];
  not_food: boolean;
  provenance: { ai_model: string; nutrition_source: 'ai_estimate' | 'engine' };
  ai_latency_ms: number;
}

/** Optional context that measurably sharpens the estimate. */
export interface AnalyzeHints {
  hint?: string;
  /** Shifts the gram estimate by a measured -31% / +40%. */
  portion?: 'small' | 'medium' | 'large';
  scale_ref?: boolean;
  correction?: string;
}

export type NutritionSource = 'engine' | 'ai_estimate';

/** Model-estimated nutrition for one item, sent when logging. */
export interface AiItemNutrition {
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
}

export interface PlateAnalysisContext {
  dish_name?: string;
  cuisine?: string;
  confidence?: 'high' | 'medium' | 'low';
  alternatives?: { dish_name: string; note?: string }[];
  assumptions?: string[];
  health_notes?: string[];
  calories_range?: { min: number; max: number };
}

export interface LogPlateItemInput {
  detected_name: string;
  food_id?: string;
  food_query?: string;
  quantity_g: number;
  cooking_method?: string;
  ai_confidence?: number;
  /** Required when nutrition_source is 'ai_estimate'. */
  nutrition?: AiItemNutrition;
}

export interface LogPlateInput {
  meal_type: MealType;
  photo_url?: string;
  notes?: string;
  source?: 'plate_vision' | 'voice' | 'manual';
  /** Omit to mean 'engine'. The plate flow sends 'ai_estimate'. */
  nutrition_source?: NutritionSource;
  analysis?: PlateAnalysisContext;
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
  analyze: async (img: PickedImage, hints: AnalyzeHints = {}): Promise<PlateAnalysis> => {
    // Native multipart upload — streams the file to the server without touching
    // the JS fetch/FormData path (which throws "Unsupported FormDataPart
    // implementation" on SDK 57 / RN 0.86).
    const base = await resolveApiBase();
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;

    const res = await FileSystem.uploadAsync(`${base}/api/v1/vision/analyze`, img.uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'image',
      mimeType: img.type ?? 'image/jpeg',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      // Extra multipart text fields. `portion` alone moves the gram estimate
      // by a measured -31% / +40%, so it is well worth the round trip.
      parameters: buildHintParams(hints),
    });

    if (res.status < 200 || res.status >= 300) {
      let message = `Couldn't analyze that (${res.status}).`;
      try {
        const err = JSON.parse(res.body) as { error?: { message?: string } };
        if (err?.error?.message) message = err.error.message;
      } catch {
        /* non-JSON error body — keep the status message */
      }
      throw new Error(message);
    }

    const parsed = JSON.parse(res.body) as { data: unknown };
    return coerceAnalysis(parsed.data);
  },
  log: (body: LogPlateInput) => api.post<PlateMeal>('/api/v1/me/plates', { body }),
};

/**
 * Guarantee the shape the UI indexes into, whatever the server returned.
 *
 * The screens do `result.alternatives.length` and `result.items.map(...)`
 * directly — on a response missing those keys that is a TypeError and a red
 * screen, not a degraded render. Since an OTA bundle can outlive the server
 * version it was written against (and vice versa), the client cannot assume a
 * particular backend is on the other end.
 */
function coerceAnalysis(raw: unknown): PlateAnalysis {
  const d = (raw ?? {}) as Record<string, any>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0);
  const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? v : []);

  const items: AnalyzedItem[] = list<Record<string, any>>(d.items).map((it) => ({
    // Tolerate the pre-dish-level field names too, so an older server still
    // renders instead of showing a plate of blank rows.
    name: String(it?.name ?? it?.detected_name ?? 'Unnamed item'),
    estimated_portion: String(it?.estimated_portion ?? ''),
    grams: n(it?.grams ?? it?.portion_g),
    calories_kcal: n(it?.calories_kcal ?? it?.nutrients?.energy_kcal),
    protein_g: n(it?.protein_g ?? it?.nutrients?.protein_g),
    carbs_g: n(it?.carbs_g ?? it?.nutrients?.carbohydrate_g),
    fat_g: n(it?.fat_g ?? it?.nutrients?.fat_g),
    fiber_g: n(it?.fiber_g ?? it?.nutrients?.fiber_g),
    sugar_g: n(it?.sugar_g),
    sodium_mg: n(it?.sodium_mg),
  }));

  const t = (d.totals ?? {}) as Record<string, any>;
  const calories = n(t.calories_kcal ?? t.energy_kcal) || items.reduce((a, i) => a + i.calories_kcal, 0);
  const range = (t.calories_range ?? {}) as Record<string, any>;

  return {
    dish_name: String(d.dish_name ?? 'Your meal'),
    cuisine: String(d.cuisine ?? ''),
    confidence: d.confidence === 'high' || d.confidence === 'medium' ? d.confidence : 'low',
    alternatives: list<Record<string, any>>(d.alternatives)
      .map((a) => ({ dish_name: String(a?.dish_name ?? ''), note: String(a?.note ?? '') }))
      .filter((a) => a.dish_name),
    assumptions: list<unknown>(d.assumptions).filter((x): x is string => typeof x === 'string'),
    items,
    totals: {
      calories_kcal: calories,
      calories_range: {
        min: n(range.min) || Math.round(calories * 0.85),
        max: n(range.max) || Math.round(calories * 1.15),
      },
      protein_g: n(t.protein_g),
      carbs_g: n(t.carbs_g ?? t.carbohydrate_g),
      fat_g: n(t.fat_g),
      fiber_g: n(t.fiber_g),
      sugar_g: n(t.sugar_g),
      sodium_mg: n(t.sodium_mg),
    },
    health_notes: list<unknown>(d.health_notes).filter((x): x is string => typeof x === 'string'),
    not_food: d.not_food === true,
    provenance: {
      ai_model: String(d.provenance?.ai_model ?? 'unknown'),
      nutrition_source: d.provenance?.nutrition_source === 'engine' ? 'engine' : 'ai_estimate',
    },
    ai_latency_ms: n(d.ai_latency_ms),
  };
}

function buildHintParams(hints: AnalyzeHints): Record<string, string> {
  const params: Record<string, string> = {};
  if (hints.hint?.trim()) params.hint = hints.hint.trim();
  if (hints.correction?.trim()) params.correction = hints.correction.trim();
  if (hints.portion) params.portion = hints.portion;
  if (hints.scale_ref) params.scale_ref = 'true';
  return params;
}

/**
 * Scale one item's nutrition to an edited gram weight.
 *
 * The model reports nutrition for the portion it estimated, so a user
 * correction is a linear rescale from that baseline. A zero-gram estimate has
 * no baseline, so it is left alone rather than divided by zero.
 */
export function scaleAnalyzedItem(item: AnalyzedItem, grams: number): AnalyzedItem {
  if (item.grams <= 0) return { ...item, grams };
  const f = grams / item.grams;
  const r1 = (v: number) => Math.round(v * f * 10) / 10;
  return {
    ...item,
    grams,
    calories_kcal: Math.round(item.calories_kcal * f),
    protein_g: r1(item.protein_g),
    carbs_g: r1(item.carbs_g),
    fat_g: r1(item.fat_g),
    fiber_g: r1(item.fiber_g),
    sugar_g: r1(item.sugar_g),
    sodium_mg: Math.round(item.sodium_mg * f),
  };
}

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
