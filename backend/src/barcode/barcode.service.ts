import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

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

const MEAL_TYPES = new Set([
  'breakfast', 'lunch', 'evening_snack', 'dinner', 'early_morning',
  'mid_morning', 'evening_snack_1', 'evening_snack_2', 'mid_breakfast',
]);

/**
 * BarcodeService — fast packaged-food logging by barcode.
 *
 * First scan of a barcode resolves it against Open Food Facts; the result is
 * cached in `barcode_products` so repeat scans are instant and we accumulate
 * our OWN curated, label-accurate product DB ("accurate, not just big"). All
 * nutrition is stored per-100g so any serving size can be computed.
 */
@Injectable()
export class BarcodeService {
  private readonly logger = new Logger(BarcodeService.name);
  private static readonly OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product';

  constructor(private readonly prisma: PrismaService) {}

  /** Resolve a barcode to a product — cache first, then Open Food Facts. */
  async lookup(rawCode: string): Promise<BarcodeProduct> {
    const barcode = (rawCode || '').replace(/\D/g, '');
    if (barcode.length < 6 || barcode.length > 18) {
      throw new BadRequestException('Invalid barcode.');
    }

    const cached = await this.fromCache(barcode);
    if (cached) return cached;

    const fetched = await this.fromOpenFoodFacts(barcode);
    if (!fetched) {
      throw new NotFoundException('No product found for this barcode. You can log it manually.');
    }
    return this.cache(fetched);
  }

  /**
   * Save a product the user typed from the label when no database had it.
   * Cached as source='manual' + verified=true — a human read the pack — so it
   * resolves instantly forever after and builds our own India-tuned DB.
   */
  async saveManual(input: {
    barcode: string; name?: string | null; brand?: string | null; serving_size?: string | null;
    kcal_100g?: number | null; protein_100g?: number | null; carb_100g?: number | null;
    fat_100g?: number | null; fiber_100g?: number | null; sodium_mg_100g?: number | null;
  }): Promise<BarcodeProduct> {
    const barcode = (input.barcode || '').replace(/\D/g, '');
    if (barcode.length < 6 || barcode.length > 18) throw new BadRequestException('Invalid barcode.');
    if (numv(input.kcal_100g) == null) throw new BadRequestException('Energy (kcal per 100g) is required.');
    const product: BarcodeProduct = {
      barcode,
      name: str(input.name),
      brand: str(input.brand),
      serving_size: str(input.serving_size),
      image_url: null,
      kcal_100g: numv(input.kcal_100g),
      protein_100g: numv(input.protein_100g),
      carb_100g: numv(input.carb_100g),
      fat_100g: numv(input.fat_100g),
      fiber_100g: numv(input.fiber_100g),
      sodium_mg_100g: numv(input.sodium_mg_100g),
      source: 'manual',
      verified: true,
    };
    return this.cache(product);
  }

  /** Log a scanned product as a meal for the calling client. */
  async logMeal(
    userId: string,
    input: { barcode: string; mealType: string; servingGrams?: number; mealName?: string },
  ): Promise<{ id: string; meal_name: string | null; kcal: number | null }> {
    const mealType = MEAL_TYPES.has(input.mealType) ? input.mealType : 'evening_snack';
    const grams = clampGrams(input.servingGrams);

    const product = await this.lookup(input.barcode);
    const [client] = await this.prisma.$queryRawUnsafe<Array<{ id: string; workspace_id: string | null }>>(
      `SELECT id, workspace_id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`, userId);
    if (!client) throw new NotFoundException('No client profile linked to this user.');

    const f = grams / 100;
    const kcal = product.kcal_100g != null ? Math.round(product.kcal_100g * f) : null;
    const snapshot = {
      source: 'barcode', barcode: product.barcode, serving_g: grams,
      energy_kcal: kcal,
      protein_g: scale(product.protein_100g, f),
      carbohydrate_g: scale(product.carb_100g, f),
      fat_g: scale(product.fat_100g, f),
      fiber_g: scale(product.fiber_100g, f),
    };
    const name = (input.mealName?.trim())
      || [product.brand, product.name].filter(Boolean).join(' ').trim()
      || 'Packaged food';

    const [row] = await this.prisma.$queryRawUnsafe<Array<{ id: string; meal_name: string | null; kcal: number | null }>>(
      `INSERT INTO public.meal_logs
         (client_id, workspace_id, meal_type, meal_name, kcal, quantity, unit, nutrition_snapshot, notes, logged_at)
       VALUES ($1::uuid, $2::uuid, $3::meal_type, $4, $5, $6, 'g', $7::jsonb, $8, now())
       RETURNING id, meal_name, kcal`,
      client.id, client.workspace_id, mealType, name, kcal, grams,
      JSON.stringify(snapshot), `Scanned barcode ${product.barcode}`);
    return row;
  }

  // ── internals ──────────────────────────────────────────────────────
  private async fromCache(barcode: string): Promise<BarcodeProduct | null> {
    const [row] = await this.prisma.$queryRawUnsafe<BarcodeRow[]>(
      `SELECT * FROM public.barcode_products WHERE barcode = $1 LIMIT 1`, barcode);
    return row ? normalizeRow(row) : null;
  }

  private async cache(p: BarcodeProduct): Promise<BarcodeProduct> {
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.barcode_products
         (barcode, name, brand, serving_size, image_url, kcal_100g, protein_100g, carb_100g, fat_100g, fiber_100g, sodium_mg_100g, source, verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (barcode) DO UPDATE SET
         name=COALESCE(EXCLUDED.name, public.barcode_products.name),
         kcal_100g=COALESCE(EXCLUDED.kcal_100g, public.barcode_products.kcal_100g),
         -- a manual (human-read) entry promotes the row to verified
         verified=(public.barcode_products.verified OR EXCLUDED.verified),
         updated_at=now()`,
      p.barcode, p.name, p.brand, p.serving_size, p.image_url,
      p.kcal_100g, p.protein_100g, p.carb_100g, p.fat_100g, p.fiber_100g, p.sodium_mg_100g, p.source, p.verified);
    return p;
  }

  private async fromOpenFoodFacts(barcode: string): Promise<BarcodeProduct | null> {
    const url = `${BarcodeService.OFF_BASE}/${barcode}.json?fields=product_name,brands,nutriments,serving_size,image_front_small_url`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'SIRAH-LIFE/1.0 (wellness platform)' } });
      if (!res.ok) return null;
      const json = (await res.json()) as OffResponse;
      if (json.status !== 1 || !json.product) return null;
      const p = json.product;
      const n = p.nutriments ?? {};
      return {
        barcode,
        name: str(p.product_name),
        brand: str(p.brands)?.split(',')[0]?.trim() ?? null,
        serving_size: str(p.serving_size),
        image_url: str(p.image_front_small_url),
        kcal_100g: numv(n['energy-kcal_100g']),
        protein_100g: numv(n.proteins_100g),
        carb_100g: numv(n.carbohydrates_100g),
        fat_100g: numv(n.fat_100g),
        fiber_100g: numv(n.fiber_100g),
        sodium_mg_100g: n.sodium_100g != null ? numv(Number(n.sodium_100g) * 1000) : null,
        source: 'openfoodfacts',
        verified: false,
      };
    } catch (err) {
      this.logger.warn(`Open Food Facts lookup failed for ${barcode}: ${(err as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

interface BarcodeRow {
  barcode: string; name: string | null; brand: string | null; serving_size: string | null; image_url: string | null;
  kcal_100g: string | null; protein_100g: string | null; carb_100g: string | null; fat_100g: string | null;
  fiber_100g: string | null; sodium_mg_100g: string | null; source: string; verified: boolean;
}
interface OffResponse { status: number; product?: OffProduct }
interface OffProduct {
  product_name?: string; brands?: string; serving_size?: string; image_front_small_url?: string;
  nutriments?: Record<string, number | string | undefined>;
}

function normalizeRow(r: BarcodeRow): BarcodeProduct {
  return {
    barcode: r.barcode, name: r.name, brand: r.brand, serving_size: r.serving_size, image_url: r.image_url,
    kcal_100g: numv(r.kcal_100g), protein_100g: numv(r.protein_100g), carb_100g: numv(r.carb_100g),
    fat_100g: numv(r.fat_100g), fiber_100g: numv(r.fiber_100g), sodium_mg_100g: numv(r.sodium_mg_100g),
    source: r.source, verified: r.verified,
  };
}
function str(v: unknown): string | null { return typeof v === 'string' && v.trim() ? v.trim() : null; }
function numv(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
function scale(v: number | null, f: number): number | null { return v == null ? null : Math.round(v * f * 10) / 10; }
function clampGrams(g: number | undefined): number {
  if (typeof g !== 'number' || !Number.isFinite(g) || g <= 0) return 100;
  return Math.min(2000, Math.round(g));
}
