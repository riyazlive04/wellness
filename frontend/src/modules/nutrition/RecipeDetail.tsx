import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft, ChefHat, Edit3, Flame, Loader2, Sparkles, Trash2, Users, Wheat,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import { COOKING_METHOD_LABEL } from '@/modules/workspace/api/nutrition';
import { recipesApi, type RecipeIngredientRow } from '@/modules/workspace/api/recipes';
import type { NutrientPanel } from '@/modules/workspace/api/nutrition';

/**
 * RecipeDetail — read-only view of a recipe.
 *
 * The server computes nutrition LIVE on every GET — summing per-ingredient
 * panels through the NutritionEngine. The detail you see here always reflects
 * the current state of the foods library.
 */
interface RecipeDetailProps {
  /** Where the back-arrow returns to. */
  listHref: string;
  /** Where the "Edit" button goes (gets ":id/edit" appended). */
  editHrefBase: string;
}

export function RecipeDetail({ listHref, editHrefBase }: RecipeDetailProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const recipeQ = useQuery({
    queryKey: ['recipes', 'detail', id],
    queryFn: () => recipesApi.get(id as string),
    enabled: !!id,
    retry: 1,
  });

  const deleteMut = useMutation({
    mutationFn: () => recipesApi.remove(id as string),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Recipe deleted');
      navigate(listHref);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not delete the recipe.';
      toast.error(msg);
    },
  });

  if (!id) return null;

  if (recipeQ.isLoading) {
    return (
      <Glass className="flex items-center justify-center p-12 text-sm text-foreground/55">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading recipe…
      </Glass>
    );
  }
  if (recipeQ.isError || !recipeQ.data) {
    return (
      <Glass className="flex flex-col items-center gap-2 p-12 text-center">
        <ChefHat className="h-6 w-6 text-foreground/30" />
        <div className="text-sm text-foreground/55">Recipe not found.</div>
        <Link to={listHref} className="mt-2 text-xs text-teal-500 hover:underline">
          Back to recipes
        </Link>
      </Glass>
    );
  }

  const { recipe, ingredients, totals, meta } = recipeQ.data;

  return (
    <motion.div
      variants={stagger(0.06, 0.05)}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      {/* Top bar */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={listHref}
          className="inline-flex items-center gap-1.5 text-xs text-foreground/55 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All recipes
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to={`${editHrefBase}/${recipe.id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs text-foreground/85 transition-colors hover:border-foreground/15 hover:bg-foreground/[0.03]"
          >
            <Edit3 className="h-3 w-3" /> Edit
          </Link>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 px-3 py-1.5 text-xs text-rose-500 transition-colors hover:bg-rose-500/10"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      </motion.div>

      {/* Header */}
      <motion.div variants={fadeUp}>
        <div className="flex flex-wrap items-baseline gap-2">
          {recipe.category && (
            <span className="text-[11px] uppercase tracking-[0.22em] text-foreground/45">
              {recipe.category}
            </span>
          )}
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em]',
              recipe.is_published ? 'text-emerald-500' : 'text-foreground/40',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', recipe.is_published ? 'bg-emerald-500' : 'bg-foreground/30')} />
            {recipe.is_published ? 'Published' : 'Draft'}
          </span>
        </div>
        <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">{recipe.name}</h1>
        {recipe.description && (
          <p className="mt-2 max-w-2xl text-sm text-foreground/65">{recipe.description}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-foreground/55">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3 w-3" />
            <span className="tabular-nums">{recipe.servings}</span> serving{recipe.servings === 1 ? '' : 's'}
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1.5">
            <Wheat className="h-3 w-3" />
            {ingredients.length} ingredient{ingredients.length === 1 ? '' : 's'}
          </span>
          {recipe.yield_factor != null && recipe.yield_factor !== 1 && (
            <>
              <span>·</span>
              <span title="cooked_weight ÷ raw_weight">
                Yield ×{recipe.yield_factor.toFixed(2)}
              </span>
            </>
          )}
        </div>
      </motion.div>

      {/* KPI tiles - per-serving */}
      <motion.div variants={fadeUp}>
        <div className="text-[11px] uppercase tracking-[0.22em] text-foreground/45">
          Per serving
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <KpiTile label="Energy" value={totals.per_serving.energy_kcal} unit="kcal" icon={<Flame className="h-3.5 w-3.5" />} highlight />
          <KpiTile label="Protein" value={totals.per_serving.protein_g} unit="g" />
          <KpiTile label="Carbs"   value={totals.per_serving.carbohydrate_g} unit="g" />
          <KpiTile label="Fat"     value={totals.per_serving.fat_g} unit="g" />
          <KpiTile label="Fiber"   value={totals.per_serving.fiber_g} unit="g" />
        </div>
      </motion.div>

      {/* Ingredient breakdown */}
      <motion.div variants={fadeUp}>
        <Glass className="overflow-hidden">
          <div className="border-b border-foreground/[0.06] px-5 py-3">
            <h2 className="text-sm font-medium">Ingredient breakdown</h2>
            <p className="mt-0.5 text-[11px] text-foreground/55">
              Each ingredient computed live through the engine - yield + retention + scale applied.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-foreground/[0.06] text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                <tr>
                  <th className="px-4 py-3 text-left font-normal">#</th>
                  <th className="px-4 py-3 text-left font-normal">Food</th>
                  <th className="px-4 py-3 text-left font-normal">Method</th>
                  <th className="px-4 py-3 text-right font-normal">Qty</th>
                  <th className="px-4 py-3 text-right font-normal">Kcal</th>
                  <th className="px-4 py-3 text-right font-normal">P (g)</th>
                  <th className="px-4 py-3 text-right font-normal">C (g)</th>
                  <th className="px-4 py-3 text-right font-normal">F (g)</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ing, idx) => (
                  <IngredientNutritionRow key={ing.id} idx={idx} ingredient={ing} />
                ))}
              </tbody>
              <tfoot className="border-t-2 border-foreground/[0.08]">
                <tr className="bg-foreground/[0.015] text-sm font-medium">
                  <td className="px-4 py-3 text-foreground/45" colSpan={3}>Total (recipe)</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground/65">
                    {fmt(totals.total_ingredient_weight_g, 0)} g
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.per_recipe.energy_kcal, 0)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.per_recipe.protein_g, 1)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.per_recipe.carbohydrate_g, 1)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.per_recipe.fat_g, 1)}</td>
                </tr>
                <tr className="text-xs text-foreground/55">
                  <td className="px-4 py-2" colSpan={3}>Per serving (÷ {recipe.servings})</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {fmt(totals.final_cooked_weight_g == null ? null : totals.final_cooked_weight_g / recipe.servings, 0)} g
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(totals.per_serving.energy_kcal, 0)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(totals.per_serving.protein_g, 1)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(totals.per_serving.carbohydrate_g, 1)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(totals.per_serving.fat_g, 1)}</td>
                </tr>
                {totals.per_100g_cooked && (
                  <tr className="text-xs text-foreground/55">
                    <td className="px-4 py-2" colSpan={3}>Per 100g cooked</td>
                    <td className="px-4 py-2 text-right tabular-nums">100 g</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(totals.per_100g_cooked.energy_kcal, 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(totals.per_100g_cooked.protein_g, 1)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(totals.per_100g_cooked.carbohydrate_g, 1)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(totals.per_100g_cooked.fat_g, 1)}</td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </Glass>
      </motion.div>

      {/* Micronutrient breakdown (per-recipe + per-serving) */}
      <motion.div variants={fadeUp}>
        <MicroPanel totals={totals.per_serving} title="Micronutrients per serving" />
      </motion.div>

      {/* Instructions */}
      {recipe.instructions && (
        <motion.div variants={fadeUp}>
          <Glass className="p-5">
            <h2 className="mb-2 text-sm font-medium">Instructions</h2>
            <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/75">
              {recipe.instructions}
            </pre>
          </Glass>
        </motion.div>
      )}

      {/* Provenance */}
      <motion.div variants={fadeUp}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.14em] text-foreground/40">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Engine v{meta.engine_version}
          </span>
          <span>·</span>
          <span>Source · {meta.database_version}</span>
          <span>·</span>
          <span>Computed {new Date(meta.computed_at).toLocaleString()}</span>
        </div>
      </motion.div>

      {showDeleteConfirm && (
        <DeleteConfirm
          name={recipe.name}
          pending={deleteMut.isPending}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => deleteMut.mutate()}
        />
      )}
    </motion.div>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────

/**
 * Null-safe number formatter. A food with missing composition data yields a
 * `null` nutrient (the engine never invents values), so every `.toFixed()` on a
 * nutrient must tolerate null — otherwise one incomplete food blanks the page.
 */
function fmt(value: number | null | undefined, digits: number): string {
  return value == null || Number.isNaN(value) ? '-' : value.toFixed(digits);
}

function KpiTile({
  label, value, unit, icon, highlight,
}: {
  label: string;
  value: number | null;
  unit: string;
  icon?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        highlight
          ? 'border-teal-500/30 bg-teal-500/5'
          : 'border-foreground/[0.07] bg-foreground/[0.015]',
      )}
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-foreground/55">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-medium tabular-nums">
          {value == null ? '-' : value.toFixed(unit === 'kcal' ? 0 : 1)}
        </span>
        <span className="text-[11px] text-foreground/45">{unit}</span>
      </div>
    </div>
  );
}

function IngredientNutritionRow({
  idx,
  ingredient,
}: {
  idx: number;
  ingredient: RecipeIngredientRow;
}) {
  return (
    <tr className="border-b border-foreground/[0.04] last:border-0 hover:bg-foreground/[0.02]">
      <td className="px-4 py-3 text-xs tabular-nums text-foreground/35">{idx + 1}.</td>
      <td className="px-4 py-3">
        <div className="text-sm text-foreground">{ingredient.food.canonical_name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
          <span>{ingredient.food.source}</span>
          {ingredient.food.source_id && (
            <>
              <span className="text-foreground/25">·</span>
              <span className="font-mono normal-case tracking-normal">{ingredient.food.source_id}</span>
            </>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-foreground/65">
        {COOKING_METHOD_LABEL[ingredient.cooking_method]}
        {ingredient.oil_added_g > 0 && (
          <div className="mt-0.5 text-[10px] text-foreground/40">
            +{ingredient.oil_added_g.toFixed(1)}g oil
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right text-xs tabular-nums text-foreground/65">
        {fmt(ingredient.quantity_g, 0)} g
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums">
        {fmt(ingredient.nutrition.energy_kcal, 0)}
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground/75">
        {fmt(ingredient.nutrition.protein_g, 1)}
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground/75">
        {fmt(ingredient.nutrition.carbohydrate_g, 1)}
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground/75">
        {fmt(ingredient.nutrition.fat_g, 1)}
      </td>
    </tr>
  );
}

function MicroPanel({ totals, title }: { totals: NutrientPanel; title: string }) {
  const ROWS: Array<{ label: string; key: keyof NutrientPanel; unit: string }> = [
    { label: 'Sodium',     key: 'sodium_mg',     unit: 'mg' },
    { label: 'Potassium',  key: 'potassium_mg',  unit: 'mg' },
    { label: 'Calcium',    key: 'calcium_mg',    unit: 'mg' },
    { label: 'Iron',       key: 'iron_mg',       unit: 'mg' },
    { label: 'Magnesium',  key: 'magnesium_mg',  unit: 'mg' },
    { label: 'Zinc',       key: 'zinc_mg',       unit: 'mg' },
    { label: 'Vitamin A',  key: 'vit_a_mcg_rae', unit: 'mcg' },
    { label: 'Vitamin C',  key: 'vit_c_mg',      unit: 'mg' },
    { label: 'Vitamin D',  key: 'vit_d_mcg',     unit: 'mcg' },
    { label: 'Folate',     key: 'vit_b9_folate_mcg', unit: 'mcg' },
    { label: 'B12',        key: 'vit_b12_cobalamin_mcg', unit: 'mcg' },
    { label: 'Saturated fat', key: 'saturated_fat_g', unit: 'g' },
  ];

  return (
    <Glass className="overflow-hidden">
      <div className="border-b border-foreground/[0.06] px-5 py-3">
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-5 sm:grid-cols-3 lg:grid-cols-4">
        {ROWS.map((row) => {
          const value = totals[row.key] as number | null;
          return (
            <div key={row.key} className="flex items-baseline justify-between border-b border-foreground/[0.04] py-1.5">
              <span className="text-xs text-foreground/65">{row.label}</span>
              <span className="text-xs tabular-nums text-foreground">
                {value == null ? <span className="text-foreground/35">-</span> : (
                  <>
                    {value.toFixed(row.unit === 'mcg' ? 1 : 2)}
                    <span className="ml-1 text-[10px] text-foreground/45">{row.unit}</span>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </Glass>
  );
}

function DeleteConfirm({
  name, pending, onCancel, onConfirm,
}: {
  name: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ">
      <Glass className="w-full max-w-sm p-5">
        <h3 className="text-sm font-medium">Delete recipe?</h3>
        <p className="mt-1 text-xs text-foreground/65">
          <span className="text-foreground">{name}</span> will be permanently removed,
          along with its ingredient rows. This can't be undone.
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs text-foreground/75 hover:border-foreground/15"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-600',
              pending && 'opacity-60',
            )}
          >
            {pending && <Loader2 className="h-3 w-3 animate-spin" />}
            Delete
          </button>
        </div>
      </Glass>
    </div>
  );
}
