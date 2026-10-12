import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/** An extra nutrient a practice tracks on every planned meal, beyond kcal/P/C/F/fibre. */
export interface NutrientColumn {
  key: string;
  label: string;
  unit: string;
  /** True for a practice's own nutrient (not in the food database). */
  custom: boolean;
}

/**
 * Nutrients the food database records per 100 g, so picking a food fills them
 * in. Keys match food_nutrients columns.
 */
export const NUTRIENT_CATALOGUE: ReadonlyArray<Omit<NutrientColumn, 'custom'>> = [
  { key: 'sodium_mg', label: 'Sodium', unit: 'mg' },
  { key: 'potassium_mg', label: 'Potassium', unit: 'mg' },
  { key: 'calcium_mg', label: 'Calcium', unit: 'mg' },
  { key: 'iron_mg', label: 'Iron', unit: 'mg' },
  { key: 'magnesium_mg', label: 'Magnesium', unit: 'mg' },
  { key: 'zinc_mg', label: 'Zinc', unit: 'mg' },
  { key: 'sugar_g', label: 'Sugar', unit: 'g' },
  { key: 'saturated_fat_g', label: 'Saturated fat', unit: 'g' },
  { key: 'cholesterol_mg', label: 'Cholesterol', unit: 'mg' },
  { key: 'vit_c_mg', label: 'Vitamin C', unit: 'mg' },
  { key: 'vit_a_mcg_rae', label: 'Vitamin A', unit: 'mcg' },
  { key: 'vit_b9_folate_mcg', label: 'Folate', unit: 'mcg' },
];
const CATALOGUE_KEYS = new Set(NUTRIENT_CATALOGUE.map((n) => n.key));
const MAX_COLUMNS = 12;
export const EXTRA_KEY = /^[a-z][a-z0-9_]{0,39}$/;

/**
 * The extra nutrient columns a practice shows on its meal plans (stored on
 * workspaces.extra_nutrients). Each planned meal keeps its values in
 * meal_cards.extra_nutrients, keyed the same way.
 */
@Injectable()
export class NutrientColumnsService {
  constructor(private readonly prisma: PrismaService) {}

  async forWorkspace(workspaceId: string): Promise<NutrientColumn[]> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ extra_nutrients: unknown }>>(
      `SELECT extra_nutrients FROM public.workspaces WHERE id = $1::uuid LIMIT 1`,
      workspaceId,
    );
    return normalise(row?.extra_nutrients);
  }

  /**
   * Replace the practice's columns. A catalogue key takes its standard name and
   * unit; anything else becomes a custom nutrient keyed from its name.
   */
  async set(workspaceId: string, input: Array<{ key?: unknown; label?: unknown; unit?: unknown }>): Promise<NutrientColumn[]> {
    if (!Array.isArray(input)) throw new BadRequestException('Send a list of nutrients.');
    if (input.length > MAX_COLUMNS) throw new BadRequestException(`Track up to ${MAX_COLUMNS} extra nutrients.`);
    const out: NutrientColumn[] = [];
    const used = new Set<string>();
    for (const e of input) {
      const key = typeof e?.key === 'string' ? e.key.trim() : '';
      if (CATALOGUE_KEYS.has(key)) {
        if (used.has(key)) continue;
        used.add(key);
        out.push({ ...NUTRIENT_CATALOGUE.find((n) => n.key === key)!, custom: false });
        continue;
      }
      const label = typeof e?.label === 'string' ? e.label.trim().replace(/\s+/g, ' ') : '';
      const unit = typeof e?.unit === 'string' ? e.unit.trim() : '';
      if (!label) throw new BadRequestException('Give the nutrient a name.');
      if (label.length > 30 || unit.length > 10) throw new BadRequestException('Keep names to 30 characters and units to 10.');
      // Keep an existing custom key on rename-free updates, else derive one.
      let k = EXTRA_KEY.test(key) && key.startsWith('x_') ? key : `x_${slug(label)}`;
      while (used.has(k) || CATALOGUE_KEYS.has(k)) k = `${k}_2`.slice(0, 40);
      used.add(k);
      out.push({ key: k, label, unit, custom: true });
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE public.workspaces SET extra_nutrients = $1::jsonb, updated_at = now() WHERE id = $2::uuid`,
      JSON.stringify(out),
      workspaceId,
    );
    return out;
  }
}

function slug(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'nutrient';
}

function normalise(raw: unknown): NutrientColumn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && typeof (e as { key?: unknown }).key === 'string')
    .map((e) => ({
      key: String(e.key),
      label: String(e.label ?? e.key),
      unit: String(e.unit ?? ''),
      custom: !CATALOGUE_KEYS.has(String(e.key)),
    }));
}

/** A meal's extra nutrient values, cleaned: known-shape keys, finite non-negative numbers. */
export function cleanExtras(raw: unknown): Record<string, number> | null {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Extra nutrients must be an object.');
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!EXTRA_KEY.test(k)) continue;
    if (v === null || v === '' || v === undefined) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100000) throw new BadRequestException(`Check the value for ${k}.`);
    out[k] = Math.round(n * 100) / 100;
  }
  if (Object.keys(out).length > 30) throw new BadRequestException('Too many extra nutrients on one meal.');
  return out;
}
