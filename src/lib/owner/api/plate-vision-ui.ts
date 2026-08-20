/**
 * ⚠️ DEAD CODE — nothing imports this module.
 *
 * It was copied from the web owner portal during the mobile port and describes
 * the OLD analyze contract (engine-resolved items with `portionG` / `macros` /
 * `box`). `/api/v1/vision/analyze` now returns a dish-level analysis whose
 * nutrition is a model estimate, so this shape no longer matches the server.
 * It also takes a `File`, which the RN upload path never produces.
 *
 * Delete it, or rewrite it against `@/lib/plate-vision-api` before use.
 */
import { api } from '@/lib/api';
import type { DetectedItem, NutritionMacros } from '@/lib/owner/types/plate-vision';

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
