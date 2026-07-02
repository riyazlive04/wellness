import { api } from '@/lib/api';

export interface BarcodeProduct {
  barcode: string;
  name: string | null;
  brand: string | null;
  serving_size: string | null;
  image_url: string | null;
  kcal_100g: number | null;
  protein_100g: number | null;
  carb_100g: number | null;
  fat_100g: number | null;
  fiber_100g: number | null;
  sodium_mg_100g: number | null;
  source: string;
  verified: boolean;
}

const BASE = '/api/v1/me/foods/barcode';

export interface ManualProductInput {
  barcode: string;
  name?: string;
  brand?: string;
  serving_size?: string;
  kcal_100g: number;
  protein_100g?: number;
  carb_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
  sodium_mg_100g?: number;
}

export const barcodeApi = {
  lookup: (code: string) => api.get<BarcodeProduct>(`${BASE}/${encodeURIComponent(code)}`),
  addManual: (body: ManualProductInput) => api.post<BarcodeProduct>(`${BASE}/manual`, { body }),
  log: (body: { barcode: string; mealType: string; servingGrams?: number; mealName?: string }) =>
    api.post<{ id: string; meal_name: string | null; kcal: number | null }>(`${BASE}/log`, { body }),
};
