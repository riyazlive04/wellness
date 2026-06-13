import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, ChefHat, GripVertical, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import {
  COOKING_METHOD_LABEL,
  nutritionApi,
  type CookingMethodCode,
  type FoodSummary,
} from '@/modules/workspace/api/nutrition';
import {
  recipesApi,
  type RecipeWithComputedNutrition,
  type UpsertRecipeIngredientInput,
} from '@/modules/workspace/api/recipes';

/**
 * RecipeBuilder — create or edit a recipe.
 *
 * Layout: 2-column on desktop.
 *   Left:   recipe header inputs + ingredient list (sortable rows)
 *   Right:  ingredient picker + tips
 *
 * After save → redirect to detail view. Live nutrition computation happens
 * server-side on every read of the detail page (not here in the form).
 */
interface RecipeBuilderProps {
  /** Existing recipe to edit, or `undefined` for a new recipe. */
  initial?: RecipeWithComputedNutrition | undefined;
  /** Where the back-arrow + cancel returns to. */
  cancelHref: string;
  /** Where to redirect on successful save (gets ":id" appended). */
  detailHrefBase: string;
}

interface IngredientDraft {
  /** Stable client-side row id (NOT the database id). */
  rowId: string;
  food: FoodSummary;
  quantity_g: number;
  cooking_method: CookingMethodCode;
  quantity_state: 'raw' | 'as_consumed';
  notes: string | null;
}

export function RecipeBuilder({ initial, cancelHref, detailHrefBase }: RecipeBuilderProps) {
  const isEdit = !!initial;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Header fields
  const [name, setName] = useState(initial?.recipe.name ?? '');
  const [description, setDescription] = useState(initial?.recipe.description ?? '');
  const [category, setCategory] = useState(initial?.recipe.category ?? '');
  const [servings, setServings] = useState(initial?.recipe.servings ?? 1);
  const [yieldFactor, setYieldFactor] = useState(initial?.recipe.yield_factor ?? 1);
  const [instructions, setInstructions] = useState(initial?.recipe.instructions ?? '');
  const [isPublished, setIsPublished] = useState(initial?.recipe.is_published ?? true);

  // Ingredient list
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(() =>
    (initial?.ingredients ?? []).map((ing) => ({
      rowId: ing.id,
      food: ing.food,
      quantity_g: ing.quantity_g,
      cooking_method: ing.cooking_method,
      quantity_state: ing.quantity_state,
      notes: ing.notes,
    })),
  );

  function patchIngredient(rowId: string, patch: Partial<IngredientDraft>) {
    setIngredients((prev) =>
      prev.map((ing) => (ing.rowId === rowId ? { ...ing, ...patch } : ing)),
    );
  }
  function removeIngredient(rowId: string) {
    setIngredients((prev) => prev.filter((ing) => ing.rowId !== rowId));
  }
  function addIngredient(food: FoodSummary) {
    if (ingredients.some((ing) => ing.food.id === food.id)) {
      toast.info(`${food.canonical_name} is already in this recipe.`);
      return;
    }
    setIngredients((prev) => [
      ...prev,
      {
        rowId: `tmp-${Date.now()}-${Math.round(performance.now())}`,
        food,
        quantity_g: food.default_serving_g ?? 100,
        cooking_method: 'raw',
        quantity_state: 'as_consumed',
        notes: null,
      },
    ]);
  }

  // Save mutation
  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        servings,
        yield_factor: yieldFactor,
        instructions: instructions.trim() || null,
        is_published: isPublished,
        ingredients: ingredients.map<UpsertRecipeIngredientInput>((ing, idx) => ({
          food_id: ing.food.id,
          quantity_g: ing.quantity_g,
          cooking_method: ing.cooking_method,
          quantity_state: ing.quantity_state,
          sort_order: idx,
          notes: ing.notes,
        })),
      };
      if (isEdit) {
        return recipesApi.update(initial!.recipe.id, payload);
      }
      return recipesApi.create(payload);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success(isEdit ? 'Recipe updated' : 'Recipe created');
      navigate(`${detailHrefBase}/${result.recipe.id}`);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not save the recipe.';
      toast.error(msg);
    },
  });

  function handleSave() {
    if (!name.trim()) {
      toast.error('Recipe needs a name.');
      return;
    }
    if (ingredients.length === 0) {
      toast.error('Add at least one ingredient.');
      return;
    }
    saveMut.mutate();
  }

  return (
    <motion.div
      variants={stagger(0.06, 0.05)}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      {/* Top bar */}
      <motion.div variants={fadeUp} className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(cancelHref)}
          className="inline-flex items-center gap-1.5 text-xs text-foreground/55 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to recipes
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(cancelHref)}
            className="rounded-full border border-foreground/[0.08] px-4 py-1.5 text-xs text-foreground/75 transition-colors hover:border-foreground/15 hover:bg-foreground/[0.03]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMut.isPending}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full bg-violet-500 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-600',
              saveMut.isPending && 'opacity-60',
            )}
          >
            {saveMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create recipe'}
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,360px]">
        {/* Left column — form */}
        <motion.div variants={fadeUp} className="space-y-5">
          <Glass className="space-y-4 p-5">
            <div>
              <Label>Recipe name</Label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Chapati"
                className="mt-1 w-full rounded-lg border border-foreground/[0.08] bg-transparent px-3 py-2 text-sm focus:border-violet-500/40 focus:outline-none"
              />
            </div>

            <div>
              <Label>Description</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional: when this is served, who it's for, any clinical notes…"
                rows={2}
                className="mt-1 w-full rounded-lg border border-foreground/[0.08] bg-transparent px-3 py-2 text-sm focus:border-violet-500/40 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Category</Label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Breakfast"
                  className="mt-1 w-full rounded-lg border border-foreground/[0.08] bg-transparent px-3 py-2 text-sm focus:border-violet-500/40 focus:outline-none"
                />
              </div>
              <div>
                <Label>Servings</Label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={servings}
                  onChange={(e) => setServings(Math.max(1, Number(e.target.value) || 1))}
                  className="mt-1 w-full rounded-lg border border-foreground/[0.08] bg-transparent px-3 py-2 text-sm tabular-nums focus:border-violet-500/40 focus:outline-none"
                />
              </div>
              <div>
                <Label title="cooked weight ÷ sum of raw ingredient weights. Default 1.0">
                  Yield factor
                </Label>
                <input
                  type="number"
                  step={0.05}
                  min={0.1}
                  max={5}
                  value={yieldFactor}
                  onChange={(e) => setYieldFactor(Math.max(0.1, Number(e.target.value) || 1))}
                  className="mt-1 w-full rounded-lg border border-foreground/[0.08] bg-transparent px-3 py-2 text-sm tabular-nums focus:border-violet-500/40 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <Label>Instructions (optional)</Label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="How to prepare. Plain text, line breaks preserved."
                rows={4}
                className="mt-1 w-full rounded-lg border border-foreground/[0.08] bg-transparent px-3 py-2 text-sm focus:border-violet-500/40 focus:outline-none"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-foreground/65">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-violet-500"
              />
              Publish (visible in pickers; uncheck to keep as draft)
            </label>
          </Glass>

          {/* Ingredients list */}
          <Glass className="overflow-hidden">
            <div className="border-b border-foreground/[0.06] px-5 py-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Ingredients</h2>
                <span className="text-[11px] tabular-nums text-foreground/45">
                  {ingredients.length} ingredient{ingredients.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            {ingredients.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-foreground/55">
                <ChefHat className="h-6 w-6 text-foreground/30" />
                Pick foods from the panel on the right to add them here.
              </div>
            ) : (
              <ul className="divide-y divide-foreground/[0.05]">
                {ingredients.map((ing, idx) => (
                  <IngredientRow
                    key={ing.rowId}
                    idx={idx}
                    ingredient={ing}
                    onPatch={(p) => patchIngredient(ing.rowId, p)}
                    onRemove={() => removeIngredient(ing.rowId)}
                  />
                ))}
              </ul>
            )}
          </Glass>
        </motion.div>

        {/* Right column — picker */}
        <motion.div variants={fadeUp}>
          <FoodPicker onPick={addIngredient} />
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─── Ingredient row ────────────────────────────────────────────────

function IngredientRow({
  idx,
  ingredient,
  onPatch,
  onRemove,
}: {
  idx: number;
  ingredient: IngredientDraft;
  onPatch: (p: Partial<IngredientDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 p-4 transition-colors hover:bg-foreground/[0.015] sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-3">
        <span className="text-[10px] tabular-nums text-foreground/35">
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">
            {ingredient.food.canonical_name}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
            <span>{ingredient.food.source}</span>
            {ingredient.food.source_id && (
              <>
                <span className="text-foreground/25">·</span>
                <span className="font-mono normal-case tracking-normal">{ingredient.food.source_id}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border border-foreground/[0.08] px-2 py-1">
          <input
            type="number"
            min={1}
            max={10000}
            step={1}
            value={ingredient.quantity_g}
            onChange={(e) => onPatch({ quantity_g: Math.max(1, Number(e.target.value) || 0) })}
            className="w-16 bg-transparent text-right text-sm tabular-nums focus:outline-none"
            aria-label="Quantity in grams"
          />
          <span className="text-[10px] text-foreground/45">g</span>
        </div>

        <select
          value={ingredient.cooking_method}
          onChange={(e) => onPatch({ cooking_method: e.target.value as CookingMethodCode })}
          className="rounded-lg border border-foreground/[0.08] bg-transparent px-2 py-1 text-xs focus:border-violet-500/40 focus:outline-none"
          aria-label="Cooking method"
        >
          {Object.entries(COOKING_METHOD_LABEL).map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>

        <select
          value={ingredient.quantity_state}
          onChange={(e) => onPatch({ quantity_state: e.target.value as 'raw' | 'as_consumed' })}
          className="rounded-lg border border-foreground/[0.08] bg-transparent px-2 py-1 text-xs focus:border-violet-500/40 focus:outline-none"
          aria-label="Quantity measurement state"
          title="'Raw' = pre-cooking weight, 'As consumed' = on-the-plate weight"
        >
          <option value="as_consumed">As-consumed</option>
          <option value="raw">Raw weight</option>
        </select>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove ingredient"
          className="rounded-lg p-1.5 text-foreground/40 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

// ─── Food picker ────────────────────────────────────────────────────

function FoodPicker({ onPick }: { onPick: (food: FoodSummary) => void }) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 250);

  const searchQ = useQuery({
    queryKey: ['nutrition', 'foods', 'picker', debouncedQuery],
    queryFn: () => nutritionApi.searchFoods({ q: debouncedQuery.trim(), limit: 12 }),
    enabled: debouncedQuery.trim().length > 0,
    retry: 1,
    staleTime: 30_000,
  });

  const hits = searchQ.data ?? [];

  return (
    <Glass className="sticky top-6 overflow-hidden">
      <div className="border-b border-foreground/[0.06] px-5 py-3">
        <h2 className="text-sm font-medium">Add ingredients</h2>
        <p className="mt-0.5 text-[11px] text-foreground/55">
          Search the food library. Click to add.
        </p>
      </div>
      <div className="border-b border-foreground/[0.06] p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Wheat flour, milk, oil…"
            className="w-full rounded-lg border border-foreground/[0.08] bg-transparent px-9 py-2 text-sm placeholder:text-foreground/35 focus:border-violet-500/40 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-foreground/40 hover:bg-foreground/[0.05]"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="max-h-[480px] overflow-y-auto">
        {query.trim() === '' ? (
          <div className="px-5 py-8 text-center text-xs text-foreground/45">
            Start typing to search the food library.
          </div>
        ) : searchQ.isLoading ? (
          <div className="flex items-center justify-center px-5 py-8 text-xs text-foreground/45">
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Searching…
          </div>
        ) : hits.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-foreground/45">
            No matches.
          </div>
        ) : (
          <ul className="divide-y divide-foreground/[0.04]">
            {hits.map((h) => (
              <li key={h.food.id}>
                <button
                  type="button"
                  onClick={() => onPick(h.food)}
                  className="group flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-foreground/[0.025]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-foreground group-hover:text-violet-500">
                      {h.food.canonical_name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
                      <span>{h.food.source}</span>
                      {h.food.source_id && (
                        <>
                          <span className="text-foreground/25">·</span>
                          <span className="font-mono normal-case tracking-normal">{h.food.source_id}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Plus className="h-3.5 w-3.5 flex-shrink-0 text-foreground/35 group-hover:text-violet-500" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Glass>
  );
}

// ─── Small bits ──────────────────────────────────────────────────────

function Label({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
      {children}
    </span>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => setDebounced(value), ms);
    return () => {
      if (tRef.current) clearTimeout(tRef.current);
    };
  }, [value, ms]);
  return debounced;
}

