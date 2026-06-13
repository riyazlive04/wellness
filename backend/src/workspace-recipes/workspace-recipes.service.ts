import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CalculatorService } from '../nutrition-engine/calculator.service';
import {
  CookingMethodCode,
  DATABASE_VERSION_DEFAULT,
  ENGINE_VERSION,
  FoodSummary,
  NutrientPanel,
} from '../nutrition-engine/nutrition.types';
import type {
  CreateRecipeInput,
  RecipeIngredientRow,
  RecipeListItem,
  RecipeNutritionTotals,
  RecipeWithComputedNutrition,
  UpdateRecipeInput,
  UpsertRecipeIngredientInput,
} from './workspace-recipes.types';

/**
 * WorkspaceRecipesService — CRUD + live nutrition computation.
 *
 * Pattern: every read of a recipe walks its ingredients, calls
 * CalculatorService.calculate per ingredient, sums the per-ingredient
 * panels, and divides by servings / cooked weight as appropriate.
 *
 * Why no snapshot:
 *   - The user explicitly opted for live recompute. Trade is slower reads;
 *     gain is that any IFCT correction or food-data fix shows up immediately
 *     in every existing recipe.
 *   - List view skips this — it returns just headers + ingredient_count to
 *     stay fast. Compute happens on detail load only.
 *
 * RLS belongs at the row-policy layer (already applied in the SQL migration),
 * but we ALSO enforce workspace_id in every query here as defence-in-depth.
 */
@Injectable()
export class WorkspaceRecipesService {
  private readonly logger = new Logger(WorkspaceRecipesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: CalculatorService,
  ) {}

  // ────────────────────────────────────────────────────────────────────
  // List + Get
  // ────────────────────────────────────────────────────────────────────

  async list(
    workspaceId: string,
    opts: { search?: string; includeDrafts?: boolean } = {},
  ): Promise<RecipeListItem[]> {
    // Raw SQL — we need to aggregate kcal across ingredients in one query
    // rather than walk the calculator per recipe (which would be expensive).
    // The aggregated value is an approximation: edible portion is applied, but
    // yield + retention + cooking-oil contributions are NOT. Detail page
    // shows the exact value.
    const params: unknown[] = [workspaceId];
    const filters: string[] = ['r.workspace_id = $1'];
    if (!opts.includeDrafts) filters.push('r.is_published = true');
    if (opts.search?.trim()) {
      params.push(`%${opts.search.trim()}%`);
      filters.push(`r.name ILIKE $${params.length}`);
    }

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        name: string;
        description: string | null;
        category: string | null;
        servings: number;
        yield_factor: string;
        is_published: boolean;
        ingredient_count: string;
        kcal_per_recipe_estimate: string | null;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `SELECT
         r.id,
         r.name,
         r.description,
         r.category,
         r.servings,
         r.yield_factor::text     AS yield_factor,
         r.is_published,
         r.created_at,
         r.updated_at,
         COALESCE(agg.ingredient_count, 0)::text AS ingredient_count,
         agg.kcal_per_recipe_estimate::text      AS kcal_per_recipe_estimate
       FROM public.workspace_recipes r
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS ingredient_count,
                SUM(
                  (n.energy_kcal::float)
                  * (i.quantity_g::float / 100.0)
                  * (f.edible_portion_fraction::float)
                ) AS kcal_per_recipe_estimate
           FROM public.workspace_recipe_ingredients i
           JOIN public.foods           f ON f.id = i.food_id
           LEFT JOIN public.food_nutrients n ON n.food_id = f.id
          WHERE i.recipe_id = r.id
       ) agg ON true
       WHERE ${filters.join(' AND ')}
       ORDER BY r.name ASC`,
      ...params,
    );

    return rows.map((r) => {
      const servings = Math.max(1, r.servings);
      const kcalRecipe = r.kcal_per_recipe_estimate == null ? null : Number(r.kcal_per_recipe_estimate);
      const kcalPerServing =
        kcalRecipe == null
          ? null
          : Math.round((kcalRecipe / servings) * 10) / 10;
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        servings,
        yield_factor: Number(r.yield_factor),
        is_published: r.is_published,
        ingredient_count: Number(r.ingredient_count),
        kcal_per_serving_estimate: kcalPerServing,
        created_at: r.created_at.toISOString(),
        updated_at: r.updated_at.toISOString(),
      };
    });
  }

  /**
   * Fetch one recipe with FULL computed nutrition. This calls the calculator
   * once per ingredient, in parallel.
   */
  async getWithNutrition(
    workspaceId: string,
    recipeId: string,
    actorUserId: string,
  ): Promise<RecipeWithComputedNutrition> {
    const recipe = await this.prisma.workspace_recipes.findFirst({
      where: { id: recipeId, workspace_id: workspaceId },
      include: {
        workspace_recipe_ingredients: {
          orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
        },
      },
    });
    if (!recipe) throw new NotFoundException(`Recipe ${recipeId} not found.`);

    // Compute every ingredient in parallel.
    const ingredients: RecipeIngredientRow[] = await Promise.all(
      recipe.workspace_recipe_ingredients.map(async (ing) => {
        const result = await this.calculator.calculate(
          {
            food_id: ing.food_id,
            quantity_g: Number(ing.quantity_g),
            cooking_method: ing.cooking_method as CookingMethodCode,
            quantity_state: ing.quantity_state as 'raw' | 'as_consumed',
          },
          {
            actor_user_id: actorUserId,
            workspace_id: workspaceId,
            target_type: 'recipe',
            target_id: recipeId,
          },
        );
        return {
          id: ing.id,
          food_id: ing.food_id,
          food: result.food as FoodSummary,
          quantity_g: Number(ing.quantity_g),
          cooking_method: result.cooking_method,
          quantity_state: ing.quantity_state as 'raw' | 'as_consumed',
          sort_order: ing.sort_order,
          notes: ing.notes,
          nutrition: result.nutrients,
          effective_weight_g: result.effective_weight_g,
          oil_added_g: result.oil_added_g,
        };
      }),
    );

    const totals = computeTotals(ingredients, Number(recipe.yield_factor), recipe.servings);

    return {
      recipe: {
        id: recipe.id,
        workspace_id: recipe.workspace_id,
        created_by_user_id: recipe.created_by_user_id,
        name: recipe.name,
        description: recipe.description,
        category: recipe.category,
        servings: recipe.servings,
        yield_factor: Number(recipe.yield_factor),
        instructions: recipe.instructions,
        notes: recipe.notes,
        is_published: recipe.is_published,
        created_at: recipe.created_at.toISOString(),
        updated_at: recipe.updated_at.toISOString(),
      },
      ingredients,
      totals,
      meta: {
        engine_version: ENGINE_VERSION,
        database_version: DATABASE_VERSION_DEFAULT,
        computed_at: new Date().toISOString(),
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Create / Update / Delete
  // ────────────────────────────────────────────────────────────────────

  async create(
    workspaceId: string,
    actorUserId: string,
    input: CreateRecipeInput,
  ): Promise<RecipeWithComputedNutrition> {
    if (!input.name?.trim()) throw new BadRequestException('name is required.');
    if (!input.ingredients?.length) {
      throw new BadRequestException('A recipe must have at least one ingredient.');
    }
    await this.assertFoodIds(input.ingredients.map((i) => i.food_id));

    const created = await this.prisma.workspace_recipes.create({
      data: {
        workspace_id: workspaceId,
        created_by_user_id: actorUserId,
        name: input.name.trim(),
        description: input.description ?? null,
        category: input.category ?? null,
        servings: input.servings ?? 1,
        yield_factor: input.yield_factor ?? 1,
        instructions: input.instructions ?? null,
        notes: input.notes ?? null,
        is_published: input.is_published ?? true,
        workspace_recipe_ingredients: {
          create: input.ingredients.map((ing, idx) => normalizeIngredient(ing, idx)),
        },
      },
    });

    return this.getWithNutrition(workspaceId, created.id, actorUserId);
  }

  async update(
    workspaceId: string,
    recipeId: string,
    actorUserId: string,
    input: UpdateRecipeInput,
  ): Promise<RecipeWithComputedNutrition> {
    const existing = await this.prisma.workspace_recipes.findFirst({
      where: { id: recipeId, workspace_id: workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Recipe ${recipeId} not found.`);

    if (input.ingredients) {
      if (input.ingredients.length === 0) {
        throw new BadRequestException('A recipe must have at least one ingredient.');
      }
      await this.assertFoodIds(input.ingredients.map((i) => i.food_id));
    }

    // Run header update + ingredient replacement in one transaction.
    await this.prisma.$transaction(async (tx) => {
      const headerPatch: Prisma.workspace_recipesUpdateInput = {};
      if (input.name !== undefined) headerPatch.name = input.name.trim();
      if (input.description !== undefined) headerPatch.description = input.description;
      if (input.category !== undefined) headerPatch.category = input.category;
      if (input.servings !== undefined) headerPatch.servings = input.servings;
      if (input.yield_factor !== undefined) headerPatch.yield_factor = input.yield_factor;
      if (input.instructions !== undefined) headerPatch.instructions = input.instructions;
      if (input.notes !== undefined) headerPatch.notes = input.notes;
      if (input.is_published !== undefined) headerPatch.is_published = input.is_published;

      if (Object.keys(headerPatch).length > 0) {
        await tx.workspace_recipes.update({
          where: { id: recipeId },
          data: headerPatch,
        });
      }

      if (input.ingredients) {
        await tx.workspace_recipe_ingredients.deleteMany({
          where: { recipe_id: recipeId },
        });
        await tx.workspace_recipe_ingredients.createMany({
          data: input.ingredients.map((ing, idx) => ({
            recipe_id: recipeId,
            ...normalizeIngredient(ing, idx),
          })),
        });
      }
    });

    return this.getWithNutrition(workspaceId, recipeId, actorUserId);
  }

  async remove(workspaceId: string, recipeId: string): Promise<{ id: string }> {
    const existing = await this.prisma.workspace_recipes.findFirst({
      where: { id: recipeId, workspace_id: workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Recipe ${recipeId} not found.`);
    await this.prisma.workspace_recipes.delete({ where: { id: recipeId } });
    return { id: recipeId };
  }

  // ────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────

  /** Confirm every food_id exists and is admin-approved — fail fast. */
  private async assertFoodIds(foodIds: string[]): Promise<void> {
    const unique = [...new Set(foodIds)];
    if (unique.length === 0) return;
    const found = await this.prisma.foods.findMany({
      where: { id: { in: unique }, is_admin_approved: true },
      select: { id: true },
    });
    const foundSet = new Set(found.map((f) => f.id));
    const missing = unique.filter((id) => !foundSet.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown or unapproved food_id(s): ${missing.join(', ')}`,
      );
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// Pure helpers (no Nest deps, easy to unit-test)
// ────────────────────────────────────────────────────────────────────

function normalizeIngredient(input: UpsertRecipeIngredientInput, idx: number) {
  if (!Number.isFinite(input.quantity_g) || input.quantity_g <= 0) {
    throw new BadRequestException(`Ingredient ${idx + 1}: quantity_g must be > 0.`);
  }
  if (input.quantity_g > 10_000) {
    throw new BadRequestException(`Ingredient ${idx + 1}: quantity_g exceeds 10kg sanity limit.`);
  }
  return {
    food_id: input.food_id,
    quantity_g: input.quantity_g,
    cooking_method: input.cooking_method ?? 'raw',
    quantity_state: input.quantity_state ?? 'as_consumed',
    sort_order: input.sort_order ?? idx,
    notes: input.notes ?? null,
  };
}

/**
 * Build the totals block from N already-computed ingredient panels.
 *
 * Sum semantics: null is treated as 0. This matches how USDA/IFCT
 * aggregate dishes — they don't track per-nutrient measurement coverage.
 * We can refine later by tracking a `partial` flag per nutrient.
 *
 * Per-100g is null if final_cooked_weight_g is 0 (no sensible denominator).
 */
function computeTotals(
  ingredients: RecipeIngredientRow[],
  yieldFactor: number,
  servings: number,
): RecipeNutritionTotals {
  const totalIngredientWeightG = ingredients.reduce(
    (sum, ing) => sum + ing.effective_weight_g,
    0,
  );
  const finalCookedWeightG = totalIngredientWeightG * yieldFactor;

  const perRecipe = sumPanels(ingredients.map((ing) => ing.nutrition));
  const perServing = scalePanel(perRecipe, servings > 0 ? 1 / servings : 1);
  const per100g = finalCookedWeightG > 0
    ? scalePanel(perRecipe, 100 / finalCookedWeightG)
    : null;

  return {
    total_ingredient_weight_g: round(totalIngredientWeightG, 2),
    final_cooked_weight_g: round(finalCookedWeightG, 2),
    per_recipe: perRecipe,
    per_serving: perServing,
    per_100g_cooked: per100g,
  };
}

const NUTRIENT_KEYS: Array<keyof NutrientPanel> = [
  'water_g', 'energy_kcal', 'energy_kj', 'protein_g', 'carbohydrate_g',
  'fat_g', 'fiber_g', 'sugar_g', 'ash_g',
  'saturated_fat_g', 'mufa_g', 'pufa_g', 'trans_fat_g', 'cholesterol_mg',
  'starch_g', 'glycemic_index',
  'sodium_mg', 'potassium_mg', 'calcium_mg', 'iron_mg', 'magnesium_mg',
  'phosphorus_mg', 'zinc_mg', 'copper_mg', 'manganese_mg', 'selenium_mcg',
  'iodine_mcg', 'chromium_mcg',
  'vit_a_mcg_rae', 'vit_d_mcg', 'vit_e_mg', 'vit_k_mcg', 'vit_c_mg',
  'vit_b1_thiamin_mg', 'vit_b2_riboflavin_mg', 'vit_b3_niacin_mg',
  'vit_b5_pantothenic_mg', 'vit_b6_pyridoxine_mg', 'vit_b7_biotin_mcg',
  'vit_b9_folate_mcg', 'vit_b12_cobalamin_mcg', 'choline_mg',
];

/** glycemic_index is intensive (doesn't sum) — it stays as a per-ingredient property only. */
const NON_SUMMABLE: ReadonlySet<keyof NutrientPanel> = new Set(['glycemic_index']);

function sumPanels(panels: NutrientPanel[]): NutrientPanel {
  const out = emptyPanel();
  for (const key of NUTRIENT_KEYS) {
    if (NON_SUMMABLE.has(key)) {
      (out as unknown as Record<string, unknown>)[key] = null;
      continue;
    }
    let anyValue = false;
    let total = 0;
    for (const p of panels) {
      const v = p[key] as number | null;
      if (v != null && Number.isFinite(v)) {
        total += v;
        anyValue = true;
      }
    }
    (out as unknown as Record<string, unknown>)[key] = anyValue ? round(total, precisionFor(key)) : null;
  }
  return out;
}

function scalePanel(panel: NutrientPanel, factor: number): NutrientPanel {
  const out = emptyPanel();
  for (const key of NUTRIENT_KEYS) {
    const v = panel[key] as number | null;
    (out as unknown as Record<string, unknown>)[key] = v == null ? null : round(v * factor, precisionFor(key));
  }
  return out;
}

function emptyPanel(): NutrientPanel {
  return {
    water_g: null, energy_kcal: 0, energy_kj: null,
    protein_g: 0, carbohydrate_g: 0, fat_g: 0,
    fiber_g: null, sugar_g: null, ash_g: null,
    saturated_fat_g: null, mufa_g: null, pufa_g: null,
    trans_fat_g: null, cholesterol_mg: null,
    starch_g: null, glycemic_index: null,
    sodium_mg: null, potassium_mg: null, calcium_mg: null,
    iron_mg: null, magnesium_mg: null, phosphorus_mg: null,
    zinc_mg: null, copper_mg: null, manganese_mg: null,
    selenium_mcg: null, iodine_mcg: null, chromium_mcg: null,
    vit_a_mcg_rae: null, vit_d_mcg: null, vit_e_mg: null,
    vit_k_mcg: null, vit_c_mg: null, vit_b1_thiamin_mg: null,
    vit_b2_riboflavin_mg: null, vit_b3_niacin_mg: null,
    vit_b5_pantothenic_mg: null, vit_b6_pyridoxine_mg: null,
    vit_b7_biotin_mcg: null, vit_b9_folate_mcg: null,
    vit_b12_cobalamin_mcg: null, choline_mg: null,
  };
}

function precisionFor(key: keyof NutrientPanel): number {
  if (key === 'energy_kcal' || key === 'energy_kj') return 1;
  if (String(key).endsWith('_g')) return 2;
  if (String(key).endsWith('_mg')) return 2;
  if (String(key).endsWith('_mcg')) return 1;
  return 2;
}

function round(n: number, decimals: number): number {
  const k = 10 ** decimals;
  return Math.round(n * k) / k;
}
