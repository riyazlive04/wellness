import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { CalculatorService } from '../nutrition-engine/calculator.service';
import type { CalculateOutput, NutrientPanel } from '../nutrition-engine/nutrition.types';
import { WorkspaceRecipesService } from './workspace-recipes.service';

/**
 * WorkspaceRecipesService — the live-nutrition aggregation is the part most
 * worth pinning down: per_recipe sums, per_serving divides, per_100g uses the
 * cooked weight (Σ effective_weight × yield_factor), and glycemic_index never
 * sums. We also lock the validation + workspace-scoping guards.
 *
 * The calculator is mocked to return deterministic panels so the totals math
 * is asserted in isolation from the real IFCT engine.
 */

function makePrismaMock() {
  return {
    workspace_recipes: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    workspace_recipe_ingredients: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    foods: {
      findMany: jest.fn(),
    },
    $queryRawUnsafe: jest.fn(),
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) =>
      typeof cb === 'function' ? cb(makeTxMock()) : undefined,
    ),
  };
}

function makeTxMock() {
  return {
    workspace_recipes: { update: jest.fn() },
    workspace_recipe_ingredients: { deleteMany: jest.fn(), createMany: jest.fn() },
  };
}

/** A nutrient panel with only the keys we assert on; the rest stay undefined. */
function panel(values: Partial<NutrientPanel>): NutrientPanel {
  return values as NutrientPanel;
}

function makeCalcOutput(nutrients: NutrientPanel, effectiveWeightG: number): CalculateOutput {
  return {
    food: { id: 'f', name: 'food', edible_portion_fraction: 1 } as unknown as CalculateOutput['food'],
    cooking_method: 'raw',
    quantity_g_input: effectiveWeightG,
    effective_weight_g: effectiveWeightG,
    oil_added_g: 0,
    nutrients,
    provenance: {
      engine_version: 'v',
      database_version: 'v',
      food_source: 'ifct' as CalculateOutput['provenance']['food_source'],
      cooking_yield_factor: null,
      retention_factors_applied: [],
    },
    audit_id: 'audit-1',
  };
}

describe('WorkspaceRecipesService', () => {
  let service: WorkspaceRecipesService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let calculator: { calculate: jest.Mock };

  beforeEach(async () => {
    prisma = makePrismaMock();
    calculator = { calculate: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceRecipesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CalculatorService, useValue: calculator },
      ],
    }).compile();
    service = module.get(WorkspaceRecipesService);
  });

  // ─── getWithNutrition — the totals math ────────────────────────────

  describe('getWithNutrition', () => {
    it('throws NotFound when the recipe is in another workspace', async () => {
      prisma.workspace_recipes.findFirst.mockResolvedValue(null);
      await expect(
        service.getWithNutrition('ws-1', 'rec-1', 'u-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sums per_recipe, divides per_serving, scales per_100g by cooked weight', async () => {
      prisma.workspace_recipes.findFirst.mockResolvedValue({
        id: 'rec-1',
        workspace_id: 'ws-1',
        created_by_user_id: 'u-1',
        name: 'Dal',
        description: null,
        category: null,
        servings: 2,
        yield_factor: 0.9,
        instructions: null,
        notes: null,
        is_published: true,
        created_at: new Date('2026-06-13T00:00:00Z'),
        updated_at: new Date('2026-06-13T00:00:00Z'),
        workspace_recipe_ingredients: [
          { id: 'i1', food_id: 'fA', quantity_g: 100, cooking_method: 'raw', quantity_state: 'as_consumed', sort_order: 0, notes: null, created_at: new Date() },
          { id: 'i2', food_id: 'fB', quantity_g: 50, cooking_method: 'raw', quantity_state: 'as_consumed', sort_order: 1, notes: null, created_at: new Date() },
        ],
      });

      calculator.calculate
        .mockResolvedValueOnce(
          makeCalcOutput(
            panel({ energy_kcal: 200, protein_g: 10, carbohydrate_g: 20, fat_g: 5, glycemic_index: 50 }),
            100,
          ),
        )
        .mockResolvedValueOnce(
          makeCalcOutput(
            panel({ energy_kcal: 100, protein_g: 5, carbohydrate_g: 0, fat_g: 2.5, glycemic_index: 60 }),
            50,
          ),
        );

      const out = await service.getWithNutrition('ws-1', 'rec-1', 'u-1');

      // per_recipe = sum of both panels
      expect(out.totals.per_recipe.energy_kcal).toBe(300);
      expect(out.totals.per_recipe.protein_g).toBe(15);
      expect(out.totals.per_recipe.carbohydrate_g).toBe(20);
      expect(out.totals.per_recipe.fat_g).toBe(7.5);
      // glycemic_index is intensive — never summed
      expect(out.totals.per_recipe.glycemic_index).toBeNull();

      // weights: Σ effective = 150, cooked = 150 × 0.9 = 135
      expect(out.totals.total_ingredient_weight_g).toBe(150);
      expect(out.totals.final_cooked_weight_g).toBe(135);

      // per_serving = per_recipe / 2
      expect(out.totals.per_serving.energy_kcal).toBe(150);
      expect(out.totals.per_serving.protein_g).toBe(7.5);

      // per_100g_cooked = per_recipe × 100 / 135
      expect(out.totals.per_100g_cooked).not.toBeNull();
      expect(out.totals.per_100g_cooked!.energy_kcal).toBe(222.2); // 300×100/135, 1 dp
      expect(out.totals.per_100g_cooked!.protein_g).toBe(11.11); // 15×100/135, 2 dp

      expect(calculator.calculate).toHaveBeenCalledTimes(2);
    });

    it('returns null per_100g_cooked when cooked weight is zero', async () => {
      prisma.workspace_recipes.findFirst.mockResolvedValue({
        id: 'rec-1', workspace_id: 'ws-1', created_by_user_id: 'u-1', name: 'Empty-weight',
        description: null, category: null, servings: 1, yield_factor: 0, instructions: null,
        notes: null, is_published: true, created_at: new Date(), updated_at: new Date(),
        workspace_recipe_ingredients: [
          { id: 'i1', food_id: 'fA', quantity_g: 100, cooking_method: 'raw', quantity_state: 'as_consumed', sort_order: 0, notes: null, created_at: new Date() },
        ],
      });
      calculator.calculate.mockResolvedValue(makeCalcOutput(panel({ energy_kcal: 100 }), 0));

      const out = await service.getWithNutrition('ws-1', 'rec-1', 'u-1');
      expect(out.totals.final_cooked_weight_g).toBe(0);
      expect(out.totals.per_100g_cooked).toBeNull();
    });
  });

  // ─── create — validation ───────────────────────────────────────────

  describe('create — validation', () => {
    it('rejects an empty name', async () => {
      await expect(
        service.create('ws-1', 'u-1', { name: '  ', ingredients: [{ food_id: 'fA', quantity_g: 100 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a recipe with no ingredients', async () => {
      await expect(
        service.create('ws-1', 'u-1', { name: 'r', ingredients: [] }),
      ).rejects.toThrow(/at least one ingredient/);
    });

    it('rejects an unknown or unapproved food_id', async () => {
      prisma.foods.findMany.mockResolvedValue([{ id: 'fA' }]); // fB missing
      await expect(
        service.create('ws-1', 'u-1', {
          name: 'r',
          ingredients: [
            { food_id: 'fA', quantity_g: 100 },
            { food_id: 'fB', quantity_g: 50 },
          ],
        }),
      ).rejects.toThrow(/Unknown or unapproved food_id/);
    });

    it('rejects a non-positive quantity_g', async () => {
      prisma.foods.findMany.mockResolvedValue([{ id: 'fA' }]);
      await expect(
        service.create('ws-1', 'u-1', {
          name: 'r',
          ingredients: [{ food_id: 'fA', quantity_g: 0 }],
        }),
      ).rejects.toThrow(/quantity_g must be > 0/);
    });

    it('persists a valid recipe and returns computed nutrition', async () => {
      prisma.foods.findMany.mockResolvedValue([{ id: 'fA' }]);
      prisma.workspace_recipes.create.mockResolvedValue({ id: 'rec-new' });
      const computed = { recipe: { id: 'rec-new' } } as Awaited<ReturnType<typeof service.getWithNutrition>>;
      const spy = jest.spyOn(service, 'getWithNutrition').mockResolvedValue(computed);

      const out = await service.create('ws-1', 'u-1', {
        name: 'Good recipe',
        ingredients: [{ food_id: 'fA', quantity_g: 100 }],
      });

      expect(prisma.workspace_recipes.create).toHaveBeenCalledTimes(1);
      const data = prisma.workspace_recipes.create.mock.calls[0][0].data;
      expect(data.workspace_id).toBe('ws-1');
      expect(data.created_by_user_id).toBe('u-1');
      expect(data.name).toBe('Good recipe');
      expect(spy).toHaveBeenCalledWith('ws-1', 'rec-new', 'u-1');
      expect(out).toBe(computed);
    });
  });

  // ─── update — scoping + validation ─────────────────────────────────

  describe('update', () => {
    it('throws NotFound when the recipe is in another workspace', async () => {
      prisma.workspace_recipes.findFirst.mockResolvedValue(null);
      await expect(
        service.update('ws-1', 'rec-1', 'u-1', { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects clearing all ingredients', async () => {
      prisma.workspace_recipes.findFirst.mockResolvedValue({ id: 'rec-1' });
      await expect(
        service.update('ws-1', 'rec-1', 'u-1', { ingredients: [] }),
      ).rejects.toThrow(/at least one ingredient/);
    });
  });

  // ─── remove — scoping ──────────────────────────────────────────────

  describe('remove', () => {
    it('throws NotFound when the recipe is missing', async () => {
      prisma.workspace_recipes.findFirst.mockResolvedValue(null);
      await expect(service.remove('ws-1', 'rec-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes only when scoped to the workspace', async () => {
      prisma.workspace_recipes.findFirst.mockResolvedValue({ id: 'rec-1' });
      prisma.workspace_recipes.delete.mockResolvedValue({ id: 'rec-1' });
      const out = await service.remove('ws-1', 'rec-1');
      expect(out).toEqual({ id: 'rec-1' });
      expect(prisma.workspace_recipes.delete).toHaveBeenCalledWith({ where: { id: 'rec-1' } });
    });
  });

  // ─── list — kcal estimate + draft filter ───────────────────────────

  describe('list', () => {
    const baseRow = {
      id: 'rec-1', name: 'Dal', description: null, category: null,
      servings: 2, yield_factor: '0.9', is_published: true,
      ingredient_count: '3', kcal_per_recipe_estimate: '300',
      created_at: new Date('2026-06-13T00:00:00Z'), updated_at: new Date('2026-06-13T00:00:00Z'),
    };

    it('computes kcal_per_serving_estimate from the recipe estimate', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([baseRow]);
      const out = await service.list('ws-1');
      expect(out[0].kcal_per_serving_estimate).toBe(150); // 300 / 2
      expect(out[0].ingredient_count).toBe(3);
      expect(out[0].yield_factor).toBe(0.9);
    });

    it('returns null kcal_per_serving_estimate when no nutrient data', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ ...baseRow, kcal_per_recipe_estimate: null }]);
      const out = await service.list('ws-1');
      expect(out[0].kcal_per_serving_estimate).toBeNull();
    });

    it('filters to published recipes by default', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);
      await service.list('ws-1');
      const sql = prisma.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('r.is_published = true');
    });

    it('includes drafts and applies a search filter when requested', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);
      await service.list('ws-1', { includeDrafts: true, search: 'dal' });
      const call = prisma.$queryRawUnsafe.mock.calls[0];
      const sql = call[0] as string;
      expect(sql).not.toContain('r.is_published = true');
      expect(sql).toContain('ILIKE');
      expect(call).toContain('%dal%'); // search param appended
    });
  });
});
