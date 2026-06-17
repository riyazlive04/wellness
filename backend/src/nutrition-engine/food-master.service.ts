import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { HealthSpecService } from './health-spec.service';
import type { FoodCategory, FoodDetail, FoodSummary, NutrientPanel, UnresolvedFood } from './nutrition.types';

/** Per-100g nutrient subset selected alongside search rows for health tags. */
const HEALTH_NUTRIENT_COLS = `
  n.fiber_g::float AS fiber_g, n.glycemic_index::float AS glycemic_index,
  n.sodium_mg::float AS sodium_mg, n.potassium_mg::float AS potassium_mg,
  n.calcium_mg::float AS calcium_mg, n.iron_mg::float AS iron_mg,
  n.protein_g::float AS protein_g, n.fat_g::float AS fat_g,
  n.saturated_fat_g::float AS saturated_fat_g, n.mufa_g::float AS mufa_g,
  n.pufa_g::float AS pufa_g, n.sugar_g::float AS sugar_g,
  n.vit_c_mg::float AS vit_c_mg, n.vit_a_mcg_rae::float AS vit_a_mcg_rae,
  n.zinc_mg::float AS zinc_mg, n.magnesium_mg::float AS magnesium_mg,
  n.vit_b9_folate_mcg::float AS vit_b9_folate_mcg, n.cholesterol_mg::float AS cholesterol_mg,
  n.trans_fat_g::float AS trans_fat_g, n.iodine_mcg::float AS iodine_mcg`;

/** Columns HEALTH_NUTRIENT_COLS adds — stripped from the returned FoodSummary. */
type HealthNutrientRow = Pick<
  NutrientPanel,
  'fiber_g' | 'glycemic_index' | 'sodium_mg' | 'potassium_mg' | 'calcium_mg' | 'iron_mg'
  | 'protein_g' | 'fat_g' | 'saturated_fat_g' | 'mufa_g' | 'pufa_g' | 'sugar_g'
  | 'vit_c_mg' | 'vit_a_mcg_rae' | 'zinc_mg' | 'magnesium_mg' | 'vit_b9_folate_mcg'
  | 'cholesterol_mg' | 'trans_fat_g' | 'iodine_mcg'
>;

/**
 * FoodMasterService — the read side of the nutrition source-of-truth.
 *
 * Responsibilities:
 *   - Resolve a free-text query (with optional language) to a food_id
 *   - Fetch full nutrient profiles by id
 *   - Surface "no confident match" rather than guessing — calling code is
 *     expected to flag these for human review, never invent numbers
 *
 * Search ranking:
 *   1. Exact match on canonical_name (case-insensitive)
 *   2. Exact match on alias (case-insensitive, language-prioritised)
 *   3. Trigram similarity on canonical_name + aliases (pg_trgm)
 *   4. Category-filtered fallback if `category` was provided
 *
 * Only is_admin_approved=true rows are surfaced. Unapproved custom_foods
 * stay invisible to clients until promoted by super admin.
 */
@Injectable()
export class FoodMasterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthSpec: HealthSpecService,
  ) {}

  /**
   * Resolve a query to the single best food, or return an UnresolvedFood
   * marker if confidence is too low. Confidence threshold: similarity > 0.45.
   */
  async resolve(query: string, language = 'en'): Promise<FoodSummary | UnresolvedFood> {
    const candidates = await this.search(query, { language, limit: 5 });
    if (candidates.length === 0) {
      return {
        query,
        reason: 'no_match',
        candidate_food_ids: [],
        recommended_action: 'manual_review_required',
      };
    }
    const top = candidates[0];
    // The top candidate is confident if it's a clear winner over #2.
    if (candidates.length === 1) return top.food;
    const margin = top.similarity - candidates[1].similarity;
    if (top.similarity >= 0.85 || margin >= 0.15) return top.food;
    return {
      query,
      reason: 'ambiguous',
      candidate_food_ids: candidates.map((c) => c.food.id),
      recommended_action: 'manual_review_required',
    };
  }

  /**
   * Search foods. Returns top N matches with similarity scores.
   * The similarity calculation: combines exact-name match (boosted to 1.0),
   * exact-alias match (0.95), and trigram similarity for fuzzy fallback.
   */
  async search(
    query: string,
    opts: { language?: string; limit?: number; category?: string } = {},
  ): Promise<Array<{ food: FoodSummary; similarity: number; energy_kcal_per_100g: number | null; good_for: string[] }>> {
    const q = query.trim();
    const lang = opts.language ?? 'en';
    const limit = Math.min(500, Math.max(1, opts.limit ?? 10));

    // Empty query → browse the full library alphabetically. This is the
    // "list all foods" mode used by the food browser landing page.
    if (!q) {
      const where: string[] = ['f.is_admin_approved = true'];
      const vals: unknown[] = [];
      if (opts.category) {
        vals.push(opts.category);
        where.push(`f.category = $${vals.length}`);
      }
      vals.push(limit);
      const rows = await this.prisma.$queryRawUnsafe<
        Array<FoodSummary & { energy_kcal_per_100g: number | null } & HealthNutrientRow>
      >(
        `SELECT f.id,
                f.source::text                  AS source,
                f.source_id,
                f.canonical_name,
                f.category,
                f.measurement_state,
                f.edible_portion_fraction::float AS edible_portion_fraction,
                f.default_serving_g::float       AS default_serving_g,
                n.energy_kcal::float             AS energy_kcal_per_100g,
                ${HEALTH_NUTRIENT_COLS}
           FROM public.foods f
           LEFT JOIN public.food_nutrients n ON n.food_id = f.id
          WHERE ${where.join(' AND ')}
          ORDER BY f.canonical_name ASC
          LIMIT $${vals.length}`,
        ...vals,
      );
      return rows.map((row) => this.toHit(row, 1));
    }

    const rows = await this.prisma.$queryRawUnsafe<
      Array<FoodSummary & { similarity: number; energy_kcal_per_100g: number | null } & HealthNutrientRow>
    >(
      `WITH ranked AS (
         SELECT f.id,
                f.source::text                AS source,
                f.source_id,
                f.canonical_name,
                f.category,
                f.measurement_state,
                f.edible_portion_fraction::float AS edible_portion_fraction,
                f.default_serving_g::float    AS default_serving_g,
                n.energy_kcal::float          AS energy_kcal_per_100g,
                ${HEALTH_NUTRIENT_COLS},
                GREATEST(
                  -- Exact name match wins
                  (CASE WHEN LOWER(f.canonical_name) = LOWER($1) THEN 1.0 ELSE 0 END)::float,
                  -- Exact alias match (any language) is nearly as good
                  COALESCE((
                    SELECT CASE
                      WHEN MAX(CASE WHEN LOWER(fa.alias) = LOWER($1) AND fa.language_code = $2 THEN 1 ELSE 0 END) = 1 THEN 0.97::float
                      WHEN MAX(CASE WHEN LOWER(fa.alias) = LOWER($1) THEN 1 ELSE 0 END) = 1                              THEN 0.92::float
                      ELSE 0::float END
                    FROM public.food_aliases fa WHERE fa.food_id = f.id
                  ), 0::float),
                  -- Trigram similarity on canonical_name (always present)
                  similarity(LOWER(f.canonical_name), LOWER($1))::float,
                  -- Word-level trigram: matches a short query ("Tomato")
                  -- against the best run of words inside a long IFCT name
                  -- ("Tomato, green (Solanum lycopersicum)"). Without this,
                  -- common single-word ingredients score far below threshold
                  -- because the botanical suffix dilutes whole-string trigrams.
                  word_similarity(LOWER($1), LOWER(f.canonical_name))::float,
                  -- Best trigram on aliases
                  COALESCE((
                    SELECT MAX(similarity(LOWER(fa.alias), LOWER($1)))::float
                      FROM public.food_aliases fa WHERE fa.food_id = f.id
                  ), 0::float),
                  -- Best word-level trigram on aliases
                  COALESCE((
                    SELECT MAX(word_similarity(LOWER($1), LOWER(fa.alias)))::float
                      FROM public.food_aliases fa WHERE fa.food_id = f.id
                  ), 0::float)
                ) AS similarity
           FROM public.foods f
           LEFT JOIN public.food_nutrients n ON n.food_id = f.id
          WHERE f.is_admin_approved = true
            ${opts.category ? `AND f.category = $3` : ''}
       )
       SELECT * FROM ranked
        WHERE similarity > 0.20
        ORDER BY similarity DESC, canonical_name ASC
        LIMIT $${opts.category ? 4 : 3}`,
      q,
      lang,
      ...(opts.category ? [opts.category, limit] : [limit]),
    );

    return rows.map((r) => this.toHit(r, r.similarity));
  }

  /**
   * Split a search row into the FoodSummary, kcal, and rule-derived "good for"
   * condition labels — stripping the extra nutrient columns we selected only to
   * power the health-tag derivation.
   */
  private toHit(
    row: FoodSummary & { energy_kcal_per_100g: number | null } & HealthNutrientRow,
    similarity: number,
  ): { food: FoodSummary; similarity: number; energy_kcal_per_100g: number | null; good_for: string[] } {
    const {
      energy_kcal_per_100g,
      fiber_g, glycemic_index, sodium_mg, potassium_mg, calcium_mg, iron_mg,
      protein_g, fat_g, saturated_fat_g, mufa_g, pufa_g, sugar_g,
      vit_c_mg, vit_a_mcg_rae, zinc_mg, magnesium_mg, vit_b9_folate_mcg,
      cholesterol_mg, trans_fat_g, iodine_mcg,
      ...food
    } = row;
    const good_for = this.healthSpec.conditionLabels(
      {
        energy_kcal: energy_kcal_per_100g ?? undefined,
        fiber_g, glycemic_index, sodium_mg, potassium_mg, calcium_mg, iron_mg,
        protein_g, fat_g, saturated_fat_g, mufa_g, pufa_g, sugar_g,
        vit_c_mg, vit_a_mcg_rae, zinc_mg, magnesium_mg, vit_b9_folate_mcg,
        cholesterol_mg, trans_fat_g, iodine_mcg,
      },
      (food as FoodSummary).category as FoodCategory,
      2,
    );
    return { food: food as FoodSummary, similarity, energy_kcal_per_100g, good_for };
  }

  /** Fetch a single food including its full nutrient panel. */
  async getById(foodId: string): Promise<FoodDetail> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<FoodSummary & NutrientPanel & { source_version: string }>
    >(
      `SELECT
         f.id, f.source::text AS source, f.source_id,
         f.canonical_name, f.category, f.measurement_state,
         f.edible_portion_fraction::float AS edible_portion_fraction,
         f.default_serving_g::float       AS default_serving_g,
         n.source_version,
         -- nutrients (all cast to float; many are nullable)
         n.water_g::float                 AS water_g,
         n.energy_kcal::float             AS energy_kcal,
         n.energy_kj::float               AS energy_kj,
         n.protein_g::float               AS protein_g,
         n.carbohydrate_g::float          AS carbohydrate_g,
         n.fat_g::float                   AS fat_g,
         n.fiber_g::float                 AS fiber_g,
         n.sugar_g::float                 AS sugar_g,
         n.ash_g::float                   AS ash_g,
         n.saturated_fat_g::float         AS saturated_fat_g,
         n.mufa_g::float                  AS mufa_g,
         n.pufa_g::float                  AS pufa_g,
         n.trans_fat_g::float             AS trans_fat_g,
         n.cholesterol_mg::float          AS cholesterol_mg,
         n.starch_g::float                AS starch_g,
         n.glycemic_index::float          AS glycemic_index,
         n.sodium_mg::float               AS sodium_mg,
         n.potassium_mg::float            AS potassium_mg,
         n.calcium_mg::float              AS calcium_mg,
         n.iron_mg::float                 AS iron_mg,
         n.magnesium_mg::float            AS magnesium_mg,
         n.phosphorus_mg::float           AS phosphorus_mg,
         n.zinc_mg::float                 AS zinc_mg,
         n.copper_mg::float               AS copper_mg,
         n.manganese_mg::float            AS manganese_mg,
         n.selenium_mcg::float            AS selenium_mcg,
         n.iodine_mcg::float              AS iodine_mcg,
         n.chromium_mcg::float            AS chromium_mcg,
         n.vit_a_mcg_rae::float           AS vit_a_mcg_rae,
         n.vit_d_mcg::float               AS vit_d_mcg,
         n.vit_e_mg::float                AS vit_e_mg,
         n.vit_k_mcg::float               AS vit_k_mcg,
         n.vit_c_mg::float                AS vit_c_mg,
         n.vit_b1_thiamin_mg::float       AS vit_b1_thiamin_mg,
         n.vit_b2_riboflavin_mg::float    AS vit_b2_riboflavin_mg,
         n.vit_b3_niacin_mg::float        AS vit_b3_niacin_mg,
         n.vit_b5_pantothenic_mg::float   AS vit_b5_pantothenic_mg,
         n.vit_b6_pyridoxine_mg::float    AS vit_b6_pyridoxine_mg,
         n.vit_b7_biotin_mcg::float       AS vit_b7_biotin_mcg,
         n.vit_b9_folate_mcg::float       AS vit_b9_folate_mcg,
         n.vit_b12_cobalamin_mcg::float   AS vit_b12_cobalamin_mcg,
         n.choline_mg::float              AS choline_mg
       FROM public.foods f
       JOIN public.food_nutrients n ON n.food_id = f.id
       WHERE f.id = $1::uuid
       LIMIT 1`,
      foodId,
    );
    if (!rows.length) throw new NotFoundException(`Food ${foodId} not found.`);
    const r = rows[0];
    // Split out the nutrient panel for a cleaner shape.
    const {
      id, source, source_id, canonical_name, category, measurement_state,
      edible_portion_fraction, default_serving_g, source_version,
      ...nutrients
    } = r;
    return {
      id, source, source_id, canonical_name, category, measurement_state,
      edible_portion_fraction, default_serving_g,
      source_version,
      nutrients: nutrients as unknown as NutrientPanel,
    } as FoodDetail;
  }
}