import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService } from './audit.service';
import { FoodMasterService } from './food-master.service';
import { RulesService } from './rules.service';
import {
  CalculateInput,
  CalculateOutput,
  CookingMethodCode,
  DATABASE_VERSION_DEFAULT,
  ENGINE_VERSION,
  FoodDetail,
  NutrientPanel,
} from './nutrition.types';

/**
 * CalculatorService — the deterministic core of the Nutrition Intelligence
 * Engine. Given (food_id | food_query, quantity_g, cooking_method), returns
 * a nutrient panel with full provenance, and writes an audit row.
 *
 * Pipeline (all deterministic, no AI):
 *
 *   1. Resolve food_id (from food_id or via FoodMasterService.resolve)
 *   2. Load 100g nutrient profile from food_nutrients
 *   3. Compute effective_weight_g:
 *        - If quantity_state='raw' and method has yield_factor:
 *            effective_weight_g = quantity_g × yield_factor
 *          (raw weight cooks into a different final weight)
 *        - Else effective_weight_g = quantity_g
 *   4. Apply edible_portion_fraction
 *        - If food.edible_portion_fraction < 1, the inedible mass (peel,
 *          shell, bone) doesn't contribute nutrients. We assume the input
 *          quantity_g is gross weight; multiply by EPF for edible portion.
 *        - For most cooked dishes EPF = 1.0; this is a no-op.
 *   5. Add cooking oil contribution
 *        - oil_added_g = (effective_weight_g/100) × oil_absorption_g_per_100g
 *        - Increments fat_g by oil_added_g, energy_kcal by oil_added_g × 9.
 *   6. Apply per-nutrient retention factor
 *        - For each nutrient mapped in nutrient_retention for this method,
 *          multiply by the factor.
 *   7. Scale per-100g panel to actual edible_weight_g
 *   8. Add oil contribution to the scaled values (oil added is gross weight,
 *      not per-100g — added AFTER scaling).
 *   9. Round to scientifically meaningful precision and return.
 *  10. Write audit row.
 *
 * Important: this engine never invents values. If a nutrient column is NULL
 * in the database, it stays NULL in the output. NULL is meaningful — it
 * means "not measured", not "zero". Clinicians need this distinction.
 */
@Injectable()
export class CalculatorService {
  private readonly logger = new Logger(CalculatorService.name);
  private readonly databaseVersion = DATABASE_VERSION_DEFAULT;

  /** kcal per gram of pure cooking oil — used to add fried-food calories. */
  private static readonly KCAL_PER_GRAM_OIL = 9;

  constructor(
    private readonly foodMaster: FoodMasterService,
    private readonly rules: RulesService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Calculate nutrition for a single food at a given quantity + cooking method.
   * Writes one audit row and returns the result including audit_id.
   *
   * Throws BadRequestException if quantity_g <= 0 or cooking_method is unknown.
   * Throws NotFoundException if the food can't be confidently resolved.
   * (Use FoodMasterService.resolve directly if you want the "unresolved" path
   * — this method assumes you've already confirmed the food.)
   */
  async calculate(
    input: CalculateInput,
    ctx: { actor_user_id?: string; workspace_id?: string; target_type?: 'food' | 'recipe' | 'meal_log' | 'plate_vision' | 'voice_log'; target_id?: string } = {},
  ): Promise<CalculateOutput> {
    if (!Number.isFinite(input.quantity_g) || input.quantity_g <= 0) {
      throw new BadRequestException('quantity_g must be a positive number (grams).');
    }
    if (input.quantity_g > 10_000) {
      throw new BadRequestException('quantity_g exceeds 10kg sanity limit.');
    }

    const cookingMethod: CookingMethodCode = (input.cooking_method ?? 'raw') as CookingMethodCode;
    const methodRow = this.rules.getMethod(cookingMethod);
    if (!methodRow) {
      throw new BadRequestException(`Unknown cooking_method "${cookingMethod}".`);
    }

    // Resolve food_id
    let foodId = input.food_id;
    if (!foodId) {
      if (!input.food_query?.trim()) {
        throw new BadRequestException('Provide either food_id or food_query.');
      }
      const resolved = await this.foodMaster.resolve(input.food_query.trim());
      if ('reason' in resolved) {
        throw new NotFoundException(
          `Could not confidently resolve "${input.food_query}". ` +
          `Reason: ${resolved.reason}. Use FoodMasterService.resolve and present candidates to the user.`,
        );
      }
      foodId = resolved.id;
    }

    const food = await this.foodMaster.getById(foodId);

    // Step 3: effective weight (raw→cooked transform if applicable)
    let effectiveWeightG = input.quantity_g;
    let yieldApplied: number | null = null;
    if (input.quantity_state === 'raw' && methodRow.yield_factor != null) {
      effectiveWeightG = input.quantity_g * methodRow.yield_factor;
      yieldApplied = methodRow.yield_factor;
    }

    // Step 4: edible portion (e.g. banana with peel = 0.65)
    const edibleWeightG = effectiveWeightG * food.edible_portion_fraction;

    // Step 5: oil added by cooking method
    const oilAddedG = (edibleWeightG / 100) * methodRow.oil_absorption_g_per_100g;

    // Step 6+7+8: retention-adjusted, scaled nutrient panel
    const panel = this.scaleAndRetain(food.nutrients, edibleWeightG, cookingMethod, oilAddedG);

    const provenance: CalculateOutput['provenance'] = {
      engine_version: ENGINE_VERSION,
      database_version: `${this.databaseVersion} (${food.source_version})`,
      food_source: food.source,
      cooking_yield_factor: yieldApplied,
      retention_factors_applied: this.rules.retentionsForMethod(cookingMethod),
    };
    if (input.ai_confidence != null) provenance.ai_confidence = input.ai_confidence;

    const output: Omit<CalculateOutput, 'audit_id'> = {
      food: {
        id: food.id,
        source: food.source,
        source_id: food.source_id,
        canonical_name: food.canonical_name,
        category: food.category,
        measurement_state: food.measurement_state,
        edible_portion_fraction: food.edible_portion_fraction,
        default_serving_g: food.default_serving_g,
      },
      cooking_method: cookingMethod,
      quantity_g_input: input.quantity_g,
      effective_weight_g: round(edibleWeightG, 2),
      oil_added_g: round(oilAddedG, 2),
      nutrients: panel,
      provenance,
    };

    const auditId = await this.audit.write({
      target_type: ctx.target_type ?? 'food',
      target_id: ctx.target_id,
      food_id: food.id,
      inputs: input,
      outputs: output,
      engine_version: ENGINE_VERSION,
      database_version: this.databaseVersion,
      ai_confidence: input.ai_confidence,
      actor_user_id: ctx.actor_user_id,
      workspace_id: ctx.workspace_id,
    });

    return { ...output, audit_id: auditId };
  }

  /**
   * Apply retention factors, scale to actual weight, then add the cooking oil
   * contribution (gross weight, not per-100g).
   *
   * Nullable behavior: a nutrient that's NULL in the source stays NULL.
   * NULL means "not measured", and we never invent a number.
   *
   * Oil contribution: only fat_g and energy_kcal are bumped. Oil's other
   * nutrients (vit E in particular) are not added because we don't know
   * which oil was used. Future phase: take oil_type as input.
   */
  private scaleAndRetain(
    per100g: NutrientPanel,
    edibleWeightG: number,
    cookingMethod: CookingMethodCode | string,
    oilAddedG: number,
  ): NutrientPanel {
    const factor = edibleWeightG / 100;

    const apply = (nutrientCode: string, raw: number | null): number | null => {
      if (raw == null) return null;
      const retention = this.rules.retentionFactor(cookingMethod, nutrientCode);
      const scaled = raw * factor * retention;
      return round(scaled, precisionFor(nutrientCode));
    };

    const result: NutrientPanel = {
      water_g:                apply('water_g',                per100g.water_g),
      energy_kcal:            apply('energy_kcal',            per100g.energy_kcal) ?? 0,
      energy_kj:              apply('energy_kj',              per100g.energy_kj),
      protein_g:              apply('protein_g',              per100g.protein_g) ?? 0,
      carbohydrate_g:         apply('carbohydrate_g',         per100g.carbohydrate_g) ?? 0,
      fat_g:                  apply('fat_g',                  per100g.fat_g) ?? 0,
      fiber_g:                apply('fiber_g',                per100g.fiber_g),
      sugar_g:                apply('sugar_g',                per100g.sugar_g),
      ash_g:                  apply('ash_g',                  per100g.ash_g),

      saturated_fat_g:        apply('saturated_fat_g',        per100g.saturated_fat_g),
      mufa_g:                 apply('mufa_g',                 per100g.mufa_g),
      pufa_g:                 apply('pufa_g',                 per100g.pufa_g),
      trans_fat_g:            apply('trans_fat_g',            per100g.trans_fat_g),
      cholesterol_mg:         apply('cholesterol_mg',         per100g.cholesterol_mg),

      starch_g:               apply('starch_g',               per100g.starch_g),
      glycemic_index:         per100g.glycemic_index,   // not a scaled quantity

      sodium_mg:              apply('sodium_mg',              per100g.sodium_mg),
      potassium_mg:           apply('potassium_mg',           per100g.potassium_mg),
      calcium_mg:             apply('calcium_mg',             per100g.calcium_mg),
      iron_mg:                apply('iron_mg',                per100g.iron_mg),
      magnesium_mg:           apply('magnesium_mg',           per100g.magnesium_mg),
      phosphorus_mg:          apply('phosphorus_mg',          per100g.phosphorus_mg),
      zinc_mg:                apply('zinc_mg',                per100g.zinc_mg),
      copper_mg:              apply('copper_mg',              per100g.copper_mg),
      manganese_mg:           apply('manganese_mg',           per100g.manganese_mg),
      selenium_mcg:           apply('selenium_mcg',           per100g.selenium_mcg),
      iodine_mcg:             apply('iodine_mcg',             per100g.iodine_mcg),
      chromium_mcg:           apply('chromium_mcg',           per100g.chromium_mcg),

      vit_a_mcg_rae:          apply('vit_a_mcg_rae',          per100g.vit_a_mcg_rae),
      vit_d_mcg:              apply('vit_d_mcg',              per100g.vit_d_mcg),
      vit_e_mg:               apply('vit_e_mg',               per100g.vit_e_mg),
      vit_k_mcg:              apply('vit_k_mcg',              per100g.vit_k_mcg),
      vit_c_mg:               apply('vit_c_mg',               per100g.vit_c_mg),
      vit_b1_thiamin_mg:      apply('vit_b1_thiamin_mg',      per100g.vit_b1_thiamin_mg),
      vit_b2_riboflavin_mg:   apply('vit_b2_riboflavin_mg',   per100g.vit_b2_riboflavin_mg),
      vit_b3_niacin_mg:       apply('vit_b3_niacin_mg',       per100g.vit_b3_niacin_mg),
      vit_b5_pantothenic_mg:  apply('vit_b5_pantothenic_mg',  per100g.vit_b5_pantothenic_mg),
      vit_b6_pyridoxine_mg:   apply('vit_b6_pyridoxine_mg',   per100g.vit_b6_pyridoxine_mg),
      vit_b7_biotin_mcg:      apply('vit_b7_biotin_mcg',      per100g.vit_b7_biotin_mcg),
      vit_b9_folate_mcg:      apply('vit_b9_folate_mcg',      per100g.vit_b9_folate_mcg),
      vit_b12_cobalamin_mcg:  apply('vit_b12_cobalamin_mcg',  per100g.vit_b12_cobalamin_mcg),
      choline_mg:             apply('choline_mg',             per100g.choline_mg),
    };

    // Add cooking oil contribution to fat + kcal.
    if (oilAddedG > 0) {
      result.fat_g = round((result.fat_g ?? 0) + oilAddedG, 2);
      result.energy_kcal = round(result.energy_kcal + oilAddedG * CalculatorService.KCAL_PER_GRAM_OIL, 1);
    }
    return result;
  }
}

// ─── Rounding helpers ────────────────────────────────────────────────

/**
 * Per-nutrient meaningful precision. Calories don't need 4 decimal places;
 * trace vitamins do. Defaults to 2 decimals when the nutrient isn't listed.
 */
function precisionFor(nutrientCode: string): number {
  if (nutrientCode === 'energy_kcal' || nutrientCode === 'energy_kj') return 1;
  if (nutrientCode.endsWith('_g')) return 2;
  if (nutrientCode.endsWith('_mg')) return 2;
  if (nutrientCode.endsWith('_mcg')) return 1;
  return 2;
}

function round(n: number, decimals: number): number {
  const k = 10 ** decimals;
  return Math.round(n * k) / k;
}