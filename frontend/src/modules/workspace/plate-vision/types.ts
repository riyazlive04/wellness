export interface NutritionMacros {
  calories: number;   // kcal
  protein: number;    // g
  carbs: number;      // g
  fat: number;        // g
  fiber?: number;     // g
}

export interface DetectedItem {
  id: string;
  name: string;
  portionG: number;            // estimated portion in grams
  confidence: number;          // 0..1
  /** 'AI' means the numbers are a photo estimate, not a database lookup. */
  source: 'IFCT' | 'USDA' | 'custom' | 'AI';
  macros: NutritionMacros;
  /** Bounding box on the source image, in percent (0..100) */
  box: { x: number; y: number; w: number; h: number };
}

export interface SamplePlate {
  id: string;
  label: string;
  cuisine: string;
  imageUrl: string;
  /** Fallback solid color if image fails */
  fallbackColor: string;
  /** A short caption shown on the chip */
  hint: string;
  items: DetectedItem[];
}

export interface ScanResult {
  imageUrl: string;
  items: DetectedItem[];
}

export type ScanState = 'idle' | 'scanning' | 'results';
