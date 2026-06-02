import { api } from '@/lib/api';
import type { DetectedItem, NutritionMacros } from './types';

export interface AnalyzeResponse {
  items: DetectedItem[];
  totalMacros: NutritionMacros;
  latencyMs: number;
  hasBoxes: boolean;
}

/** POST an image File (or Blob) to the backend Plate Vision analyzer. */
export async function analyzePlate(image: File | Blob): Promise<AnalyzeResponse> {
  const fd = new FormData();
  const filename = image instanceof File ? image.name : `plate.${extFor(image.type)}`;
  fd.append('image', image, filename);
  return api.post<AnalyzeResponse>('/api/v1/vision/analyze', { body: fd });
}

function extFor(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png'))  return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('heic')) return 'heic';
  return 'bin';
}
