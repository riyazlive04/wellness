import { Test, TestingModule } from '@nestjs/testing';
import { AuditService, AuditWriteParams } from './audit.service';
import { CalculatorService } from './calculator.service';
import { FoodMasterService } from './food-master.service';
import { RulesService } from './rules.service';
import type { CookingMethod } from './rules.service';
import type { CookingMethodCode, FoodDetail, NutrientPanel } from './nutrition.types';

/**
 * Calculator tests — the deterministic core of the Nutrition Engine.
 *
 * These tests use stub services (no DB) to verify the science of the
 * pipeline:
 *   - Per-100g scaling
 *   - Edible portion fraction
 *   - Raw → cooked weight transform via yield_factor
 *   - Oil absorption for fried foods (fat + 9 kcal/g contribution)
 *   - Retention factor application per nutrient
 *   - NULL preservation for unmeasured nutrients
 *
 * Test numbers picked from documented IFCT / USDA examples — see comments
 * on individual tests for citation.
 */

// ─── Stub fixtures ───────────────────────────────────────────────────

const RICE_RAW_100G: NutrientPanel = {
  // Per IFCT 2017, A001 (Rice, raw, milled) per 100g edible portion
  water_g: 12.0,
  energy_kcal: 356,
  energy_kj: 1490,
  protein_g: 7.94,
  carbohydrate_g: 78.24,
  fat_g: 0.52,
  fiber_g: 2.81,
  sugar_g: null,
  ash_g: 0.5,

  saturated_fat_g: 0.13,
  mufa_g: 0.16,
  pufa_g: 0.14,
  trans_fat_g: null,
  cholesterol_mg: 0,

  starch_g: 73.5,
  glycemic_index: 73,

  sodium_mg: 1,
  potassium_mg: 88,
  calcium_mg: 9,
  iron_mg: 0.72,
  magnesium_mg: 25,
  phosphorus_mg: 95,
  zinc_mg: 1.16,
  copper_mg: 0.21,
  manganese_mg: 1.08,
  selenium_mcg: 15.1,
  iodine_mcg: null,
  chromium_mcg: null,

  vit_a_mcg_rae: 0,
  vit_d_mcg: 0,
  vit_e_mg: 0.11,
  vit_k_mcg: 0.1,
  vit_c_mg: 0,
  vit_b1_thiamin_mg: 0.07,
  vit_b2_riboflavin_mg: 0.05,
  vit_b3_niacin_mg: 1.6,
  vit_b5_pantothenic_mg: 1.01,
  vit_b6_pyridoxine_mg: 0.16,
  vit_b7_biotin_mcg: null,
  vit_b9_folate_mcg: 8,
  vit_b12_cobalamin_mcg: 0,
  choline_mg: null,
};

const BANANA_WITH_PEEL_100G: NutrientPanel = {
  // Per USDA FDC: banana raw. Note: edible_portion_fraction = 0.65
  // (peel is ~35% of total weight).
  water_g: 74.91,
  energy_kcal: 89,
  energy_kj: 371,
  protein_g: 1.09,
  carbohydrate_g: 22.84,
  fat_g: 0.33,
  fiber_g: 2.6,
  sugar_g: 12.23,
  ash_g: 0.82,
  saturated_fat_g: 0.11,
  mufa_g: 0.03,
  pufa_g: 0.07,
  trans_fat_g: 0,
  cholesterol_mg: 0,
  starch_g: 5.38,
  glycemic_index: 51,
  sodium_mg: 1,
  potassium_mg: 358,
  calcium_mg: 5,
  iron_mg: 0.26,
  magnesium_mg: 27,
  phosphorus_mg: 22,
  zinc_mg: 0.15,
  copper_mg: 0.078,
  manganese_mg: 0.27,
  selenium_mcg: 1.0,
  iodine_mcg: null,
  chromium_mcg: null,
  vit_a_mcg_rae: 3,
  vit_d_mcg: 0,
  vit_e_mg: 0.1,
  vit_k_mcg: 0.5,
  vit_c_mg: 8.7,
  vit_b1_thiamin_mg: 0.031,
  vit_b2_riboflavin_mg: 0.073,
  vit_b3_niacin_mg: 0.665,
  vit_b5_pantothenic_mg: 0.334,
  vit_b6_pyridoxine_mg: 0.367,
  vit_b7_biotin_mcg: null,
  vit_b9_folate_mcg: 20,
  vit_b12_cobalamin_mcg: 0,
  choline_mg: 9.8,
};

const CHICKEN_RAW_100G: NutrientPanel = {
  // Chicken breast raw, USDA FDC
  water_g: 75.46,
  energy_kcal: 120,
  energy_kj: 502,
  protein_g: 22.5,
  carbohydrate_g: 0,
  fat_g: 2.62,
  fiber_g: 0,
  sugar_g: 0,
  ash_g: 1.04,
  saturated_fat_g: 0.7,
  mufa_g: 0.93,
  pufa_g: 0.57,
  trans_fat_g: 0.02,
  cholesterol_mg: 73,
  starch_g: 0,
  glycemic_index: null,
  sodium_mg: 45,
  potassium_mg: 334,
  calcium_mg: 5,
  iron_mg: 0.37,
  magnesium_mg: 29,
  phosphorus_mg: 213,
  zinc_mg: 0.68,
  copper_mg: 0.046,
  manganese_mg: 0.016,
  selenium_mcg: 22.8,
  iodine_mcg: null,
  chromium_mcg: null,
  vit_a_mcg_rae: 9,
  vit_d_mcg: 0.1,
  vit_e_mg: 0.27,
  vit_k_mcg: null,
  vit_c_mg: 1.2,
  vit_b1_thiamin_mg: 0.073,
  vit_b2_riboflavin_mg: 0.096,
  vit_b3_niacin_mg: 9.91,
  vit_b5_pantothenic_mg: 0.99,
  vit_b6_pyridoxine_mg: 0.55,
  vit_b7_biotin_mcg: null,
  vit_b9_folate_mcg: 4,
  vit_b12_cobalamin_mcg: 0.31,
  choline_mg: 73.4,
};

function foodFixture(overrides: Partial<FoodDetail> & { nutrients: NutrientPanel }): FoodDetail {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    source: 'IFCT-2017',
    source_id: 'TEST-001',
    canonical_name: 'Test food',
    category: 'cereals',
    measurement_state: 'raw',
    edible_portion_fraction: 1.0,
    default_serving_g: 100,
    source_version: 'IFCT-2017',
    ...overrides,
  };
}

// ─── Stub services ───────────────────────────────────────────────────

class StubFoodMasterService {
  constructor(private readonly food: FoodDetail) {}
  getById = jest.fn(async (id: string): Promise<FoodDetail> => {
    if (id !== this.food.id) throw new Error('not found');
    return this.food;
  });
  resolve = jest.fn(async (query: string) => ({
    id: this.food.id,
    source: this.food.source,
    source_id: this.food.source_id,
    canonical_name: query,
    category: this.food.category,
    measurement_state: this.food.measurement_state,
    edible_portion_fraction: this.food.edible_portion_fraction,
    default_serving_g: this.food.default_serving_g,
  }));
  search = jest.fn();
}

class StubRulesService {
  private methods: Record<string, CookingMethod> = {
    raw:        { code: 'raw',        label: 'Raw',         yield_factor: null,  oil_absorption_g_per_100g: 0,  water_added_g_per_100g: 0 },
    boiled:     { code: 'boiled',     label: 'Boiled',      yield_factor: 1.0,   oil_absorption_g_per_100g: 0,  water_added_g_per_100g: 0 },
    deep_fried: { code: 'deep_fried', label: 'Deep fried',  yield_factor: 0.8,   oil_absorption_g_per_100g: 12, water_added_g_per_100g: 0 },
    pressure_cooked: { code: 'pressure_cooked', label: 'Pressure cooked', yield_factor: 2.6, oil_absorption_g_per_100g: 0, water_added_g_per_100g: 5 },
  };
  private retention: Record<string, Record<string, number>> = {
    boiled:     { vit_c_mg: 0.5, vit_b9_folate_mcg: 0.55, potassium_mg: 0.8 },
    deep_fried: { vit_c_mg: 0.5, vit_e_mg: 0.55 },
  };
  getMethod = (code: string) => this.methods[code] ?? null;
  retentionFactor = (method: string, nutrient: string) =>
    this.retention[method]?.[nutrient] ?? 1.0;
  retentionsForMethod = (method: string) => {
    const inner = this.retention[method];
    if (!inner) return [];
    return Object.entries(inner).map(([nutrient, factor]) => ({ nutrient, factor }));
  };
}

class StubAuditService {
  write = jest.fn<Promise<string>, [AuditWriteParams]>(async () => 'audit-uuid-stub');
  getById = jest.fn();
}

// ─── Test harness ────────────────────────────────────────────────────

async function buildCalculator(food: FoodDetail): Promise<{
  calculator: CalculatorService;
  foodMaster: StubFoodMasterService;
  audit: StubAuditService;
}> {
  const foodMaster = new StubFoodMasterService(food);
  const audit = new StubAuditService();
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CalculatorService,
      { provide: FoodMasterService, useValue: foodMaster },
      { provide: RulesService, useClass: StubRulesService },
      { provide: AuditService, useValue: audit },
    ],
  }).compile();
  return {
    calculator: module.get(CalculatorService),
    foodMaster,
    audit,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('CalculatorService', () => {
  describe('per-100g scaling', () => {
    it('100g raw rice → exact IFCT values (no transforms)', async () => {
      const { calculator } = await buildCalculator(foodFixture({ nutrients: RICE_RAW_100G }));
      const out = await calculator.calculate({
        food_id: '00000000-0000-0000-0000-000000000001',
        quantity_g: 100,
        cooking_method: 'raw',
      });

      expect(out.effective_weight_g).toBeCloseTo(100, 1);
      expect(out.oil_added_g).toBe(0);
      expect(out.nutrients.energy_kcal).toBeCloseTo(356, 0);
      expect(out.nutrients.protein_g).toBeCloseTo(7.94, 2);
      expect(out.nutrients.carbohydrate_g).toBeCloseTo(78.24, 2);
    });

    it('50g raw rice → half of IFCT values', async () => {
      const { calculator } = await buildCalculator(foodFixture({ nutrients: RICE_RAW_100G }));
      const out = await calculator.calculate({
        food_id: '00000000-0000-0000-0000-000000000001',
        quantity_g: 50,
        cooking_method: 'raw',
      });
      expect(out.nutrients.energy_kcal).toBeCloseTo(178, 0);
      expect(out.nutrients.protein_g).toBeCloseTo(3.97, 2);
      expect(out.nutrients.fat_g).toBeCloseTo(0.26, 2);
    });
  });

  describe('edible portion fraction', () => {
    it('100g whole banana (with peel) → 65g edible weight → scaled accordingly', async () => {
      const banana = foodFixture({
        canonical_name: 'Banana with peel',
        category: 'fruits',
        edible_portion_fraction: 0.65,
        nutrients: BANANA_WITH_PEEL_100G,
      });
      const { calculator } = await buildCalculator(banana);
      const out = await calculator.calculate({
        food_id: banana.id,
        quantity_g: 100,
        cooking_method: 'raw',
      });
      // Edible weight = 65g, so nutrients are 65% of per-100g.
      expect(out.effective_weight_g).toBeCloseTo(65, 1);
      expect(out.nutrients.energy_kcal).toBeCloseTo(89 * 0.65, 0); // ≈ 58
      expect(out.nutrients.potassium_mg).toBeCloseTo(358 * 0.65, 0); // ≈ 233
    });
  });

  describe('cooking yield factor (raw → cooked)', () => {
    it('100g raw rice + pressure_cooked (yield 2.6) + quantity_state=raw → 260g cooked', async () => {
      const { calculator } = await buildCalculator(foodFixture({ nutrients: RICE_RAW_100G }));
      const out = await calculator.calculate({
        food_id: '00000000-0000-0000-0000-000000000001',
        quantity_g: 100,
        cooking_method: 'pressure_cooked',
        quantity_state: 'raw',
      });
      expect(out.effective_weight_g).toBeCloseTo(260, 1);
      expect(out.provenance.cooking_yield_factor).toBe(2.6);
      // Nutrients scale to 260g (2.6× the per-100g values).
      expect(out.nutrients.energy_kcal).toBeCloseTo(356 * 2.6, 0); // ≈ 926
      expect(out.nutrients.protein_g).toBeCloseTo(7.94 * 2.6, 2); // ≈ 20.6
    });

    it('quantity_state default is as_consumed → yield_factor NOT applied', async () => {
      const { calculator } = await buildCalculator(foodFixture({ nutrients: RICE_RAW_100G }));
      const out = await calculator.calculate({
        food_id: '00000000-0000-0000-0000-000000000001',
        quantity_g: 100,
        cooking_method: 'pressure_cooked',
        // no quantity_state — defaults to as_consumed
      });
      expect(out.effective_weight_g).toBeCloseTo(100, 1);
      expect(out.provenance.cooking_yield_factor).toBeNull();
    });
  });

  describe('oil absorption (deep fried)', () => {
    it('100g chicken + deep_fried → +12g fat + 108 kcal from oil', async () => {
      const chicken = foodFixture({
        canonical_name: 'Chicken breast',
        category: 'poultry',
        nutrients: CHICKEN_RAW_100G,
      });
      const { calculator } = await buildCalculator(chicken);
      const out = await calculator.calculate({
        food_id: chicken.id,
        quantity_g: 100,
        cooking_method: 'deep_fried',
      });
      // 12g oil at 9 kcal/g = 108 kcal added on top of 120 kcal base
      expect(out.oil_added_g).toBeCloseTo(12, 1);
      expect(out.nutrients.fat_g).toBeCloseTo(2.62 + 12, 2);
      expect(out.nutrients.energy_kcal).toBeCloseTo(120 + 108, 0); // = 228
    });
  });

  describe('retention factors', () => {
    it('100g banana + boiled → vit C drops by 50%, potassium by 20%', async () => {
      const banana = foodFixture({
        canonical_name: 'Banana raw',
        category: 'fruits',
        edible_portion_fraction: 1.0,
        nutrients: BANANA_WITH_PEEL_100G,
      });
      const { calculator } = await buildCalculator(banana);
      const out = await calculator.calculate({
        food_id: banana.id,
        quantity_g: 100,
        cooking_method: 'boiled',
      });
      // Vit C retention 0.5: 8.7 × 0.5 = 4.35
      expect(out.nutrients.vit_c_mg).toBeCloseTo(4.35, 1);
      // Potassium retention 0.8: 358 × 0.8 = 286.4
      expect(out.nutrients.potassium_mg).toBeCloseTo(286.4, 0);
      // Calcium not in retention table → factor 1.0 → unchanged
      expect(out.nutrients.calcium_mg).toBeCloseTo(5, 1);
      // Provenance lists the retentions actually applied
      expect(out.provenance.retention_factors_applied).toEqual(
        expect.arrayContaining([
          { nutrient: 'vit_c_mg', factor: 0.5 },
          { nutrient: 'potassium_mg', factor: 0.8 },
        ]),
      );
    });
  });

  describe('NULL preservation', () => {
    it('food with NULL trans_fat → output has NULL, not 0', async () => {
      const food = foodFixture({ nutrients: RICE_RAW_100G }); // trans_fat_g: null
      const { calculator } = await buildCalculator(food);
      const out = await calculator.calculate({
        food_id: food.id,
        quantity_g: 100,
      });
      expect(out.nutrients.trans_fat_g).toBeNull();
      // sanity: a measured-zero stays zero, not null
      expect(out.nutrients.vit_c_mg).toBe(0);
    });
  });

  describe('validation', () => {
    it('rejects quantity_g <= 0', async () => {
      const { calculator } = await buildCalculator(foodFixture({ nutrients: RICE_RAW_100G }));
      await expect(
        calculator.calculate({ food_id: 'x', quantity_g: 0 }),
      ).rejects.toThrow(/positive/);
    });

    it('rejects quantity_g > 10kg', async () => {
      const { calculator } = await buildCalculator(foodFixture({ nutrients: RICE_RAW_100G }));
      await expect(
        calculator.calculate({ food_id: 'x', quantity_g: 10_001 }),
      ).rejects.toThrow(/sanity/);
    });

    it('rejects unknown cooking_method', async () => {
      const { calculator } = await buildCalculator(foodFixture({ nutrients: RICE_RAW_100G }));
      await expect(
        calculator.calculate({
          food_id: 'x',
          quantity_g: 100,
          cooking_method: 'plasma_cooked' as CookingMethodCode,
        }),
      ).rejects.toThrow(/Unknown cooking_method/);
    });
  });

  describe('audit', () => {
    it('writes one audit row per calculation and includes audit_id in output', async () => {
      const { calculator, audit } = await buildCalculator(foodFixture({ nutrients: RICE_RAW_100G }));
      const out = await calculator.calculate({
        food_id: '00000000-0000-0000-0000-000000000001',
        quantity_g: 100,
      });
      expect(audit.write).toHaveBeenCalledTimes(1);
      expect(out.audit_id).toBe('audit-uuid-stub');
      // Audit shape includes engine_version + database_version
      const call = (audit.write.mock.calls[0]?.[0] as { engine_version?: string; database_version?: string }) ?? {};
      expect(call.engine_version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(call.database_version).toBeTruthy();
    });

    it('forwards ai_confidence + workspace context to the audit row', async () => {
      const { calculator, audit } = await buildCalculator(foodFixture({ nutrients: RICE_RAW_100G }));
      await calculator.calculate(
        {
          food_id: '00000000-0000-0000-0000-000000000001',
          quantity_g: 100,
          ai_confidence: 0.82,
        },
        {
          actor_user_id: 'user-1',
          workspace_id: 'ws-1',
          target_type: 'plate_vision',
        },
      );
      const call = audit.write.mock.calls[0][0];
      expect(call.ai_confidence).toBe(0.82);
      expect(call.actor_user_id).toBe('user-1');
      expect(call.workspace_id).toBe('ws-1');
      expect(call.target_type).toBe('plate_vision');
    });
  });
});