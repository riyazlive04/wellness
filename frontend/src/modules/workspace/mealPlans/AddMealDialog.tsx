import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Loader2, Pencil, Search, Trash2, Utensils, X } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import { recipesApi } from '../api/recipes';
import { nutritionApi } from '../api/nutrition';
import { mealPlansApi, SLOT_LABELS, type AddCardInput, type MealCard, type MealSlot, type SavedMeal } from '../api/mealPlans';

interface AddMealDialogProps {
  open: boolean;
  dayNumber: number;
  slot: MealSlot;
  /** Present when editing rather than adding. */
  editing?: MealCard | null;
  onClose: () => void;
  onSubmit: (input: AddCardInput) => Promise<void>;
  /** Only supplied when editing — removes the meal from the plan. */
  onDelete?: () => Promise<void>;
}

type Mode = 'library' | 'custom';

/**
 * Add or edit one meal. Two ways in, because both are real:
 *   - library → pick a workspace recipe or a food-master item; kcal auto-fills
 *     and the card keeps a source_id link back to it
 *   - custom  → type it. The library will never cover every home meal, and
 *     forcing a nutritionist to create a recipe first would just make them
 *     abandon the planner.
 */
export function AddMealDialog({ open, dayNumber, slot, editing, onClose, onSubmit, onDelete }: AddMealDialogProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('custom');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [source, setSource] = useState<{ type: 'recipe' | 'food'; id: string } | null>(null);

  // Reset per open — a stale form from the previous cell is a real hazard here.
  useEffect(() => {
    if (!open) return;
    setMode('custom');
    setSearch('');
    setName(editing?.meal_name ?? '');
    setKcal(editing?.kcal ? String(editing.kcal) : '');
    setQuantity(editing?.quantity != null ? String(editing.quantity) : '');
    setUnit(editing?.unit ?? '');
    setDescription(editing?.description ?? '');
    setIngredients(editing?.ingredients ?? '');
    setSource(
      editing?.source_type && editing.source_id
        ? { type: editing.source_type, id: editing.source_id }
        : null,
    );
  }, [open, editing]);

  const q = search.trim();

  const savedQ = useQuery({
    queryKey: ['workspace', 'meal-plans', 'saved-meals', q],
    queryFn: () => mealPlansApi.savedMeals(q || undefined),
    enabled: open && mode === 'library',
    staleTime: 30_000,
  });

  const recipesQ = useQuery({
    queryKey: ['workspace', 'recipes', 'picker', q],
    queryFn: () => recipesApi.list({ search: q || undefined }),
    enabled: open && mode === 'library',
    staleTime: 60_000,
  });

  const foodsQ = useQuery({
    queryKey: ['nutrition', 'foods', 'picker', q],
    queryFn: () => nutritionApi.searchFoods({ q, limit: 8 }),
    enabled: open && mode === 'library' && q.length >= 2,
    staleTime: 60_000,
  });

  const recipes = useMemo(
    () => (recipesQ.data ?? []).filter((r) => r.is_published).slice(0, 8),
    [recipesQ.data],
  );

  if (!open) return null;

  function pickSaved(m: SavedMeal) {
    // A reusable copy of a meal you typed before — editable, no source link.
    setName(m.meal_name);
    setKcal(m.kcal ? String(Math.round(m.kcal)) : '');
    setQuantity(m.quantity != null ? String(m.quantity) : '');
    setUnit(m.unit ?? '');
    setDescription(m.description ?? '');
    setIngredients(m.ingredients ?? '');
    setSource(null);
    setMode('custom');
  }

  function pickRecipe(r: { id: string; name: string; kcal_per_serving_estimate: number | null; description: string | null }) {
    setName(r.name);
    setKcal(r.kcal_per_serving_estimate ? String(Math.round(r.kcal_per_serving_estimate)) : '');
    setQuantity('1');
    setUnit('serving');
    setDescription(r.description ?? '');
    setSource({ type: 'recipe', id: r.id });
    setMode('custom'); // drop into the form so they can adjust before saving
  }

  function pickFood(hit: { food: { id: string; canonical_name: string; default_serving_g: number | null }; energy_kcal_per_100g: number | null }) {
    const grams = hit.food.default_serving_g ?? 100;
    // Food master stores per-100g; scale to the default serving.
    const scaled = hit.energy_kcal_per_100g != null
      ? Math.round((hit.energy_kcal_per_100g * grams) / 100)
      : 0;
    setName(hit.food.canonical_name);
    setKcal(scaled ? String(scaled) : '');
    setQuantity(String(grams));
    setUnit('g');
    setSource({ type: 'food', id: hit.food.id });
    setMode('custom');
  }

  async function save() {
    if (!name.trim()) {
      toast.error('Give the meal a name');
      return;
    }
    // quantity is NUMERIC server-side — send a number or nothing at all.
    const qty = Number(quantity.trim());
    if (quantity.trim() && !Number.isFinite(qty)) {
      toast.error('Quantity must be a number - put the words in Unit (e.g. 2 / katori)');
      return;
    }

    setBusy(true);
    try {
      await onSubmit({
        dayNumber,
        mealType: slot,
        mealName: name.trim(),
        kcal: kcal.trim() ? Math.max(0, Math.round(Number(kcal))) : 0,
        quantity: quantity.trim() ? qty : undefined,
        unit: unit.trim() || undefined,
        description: description.trim() || undefined,
        ingredients: ingredients.trim() || undefined,
        sourceType: source?.type,
        sourceId: source?.id,
      });
      // A newly free-typed meal (no library link) joins "My foods" — refresh it.
      if (!source) queryClient.invalidateQueries({ queryKey: ['workspace', 'meal-plans', 'saved-meals'] });
      onClose();
    } catch (err) {
      toast.error((err as Error).message ?? 'Could not save this meal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" onClick={() => !busy && onClose()}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg p-4 md:p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Glass variant="heavy" className="max-h-[85vh] overflow-y-auto rounded-2xl">
          <header className="flex items-start justify-between px-6 pt-6">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {editing ? 'Edit meal' : 'Add meal'}
              </h2>
              <p className="mt-1 text-xs text-foreground/60">
                Day {dayNumber} · {SLOT_LABELS[slot]}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-foreground/60 hover:bg-foreground/[0.06] hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="px-6 pb-6 pt-4">
            <div className="mb-4 inline-flex rounded-full bg-foreground/[0.05] p-0.5 text-xs">
              <ModeTab icon={Pencil} label="Type it" active={mode === 'custom'} onClick={() => setMode('custom')} />
              <ModeTab icon={BookOpen} label="From library" active={mode === 'library'} onClick={() => setMode('library')} />
            </div>

            {mode === 'library' ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/45" />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search recipes and foods…"
                    className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] py-2.5 pl-9 pr-3 text-sm focus:border-teal-400/60 focus:outline-none"
                  />
                </div>

                <Section title="My foods" loading={savedQ.isLoading}>
                  {(savedQ.data ?? []).length === 0 ? (
                    <Empty>{q ? 'No saved meals match.' : 'Meals you type get saved here for reuse.'}</Empty>
                  ) : (
                    (savedQ.data ?? []).map((m, i) => (
                      <PickRow
                        key={`${m.meal_name}-${i}`}
                        title={m.meal_name}
                        sub={m.kcal ? `${Math.round(m.kcal)} kcal${m.unit ? ` · ${m.quantity ?? ''} ${m.unit}`.trimEnd() : ''}` : (m.unit ? `${m.quantity ?? ''} ${m.unit}`.trim() : 'reuse')}
                        onClick={() => pickSaved(m)}
                      />
                    ))
                  )}
                </Section>

                <Section title="Your recipes" loading={recipesQ.isLoading}>
                  {recipes.length === 0 ? (
                    <Empty>No published recipes match.</Empty>
                  ) : (
                    recipes.map((r) => (
                      <PickRow
                        key={r.id}
                        title={r.name}
                        sub={r.kcal_per_serving_estimate ? `≈${Math.round(r.kcal_per_serving_estimate)} kcal / serving` : 'kcal not computed'}
                        onClick={() => pickRecipe(r)}
                      />
                    ))
                  )}
                </Section>

                <Section title="Food library" loading={foodsQ.isLoading}>
                  {q.length < 2 ? (
                    <Empty>Type at least 2 letters to search foods.</Empty>
                  ) : (foodsQ.data ?? []).length === 0 ? (
                    <Empty>No foods match.</Empty>
                  ) : (
                    (foodsQ.data ?? []).map((hit) => (
                      <PickRow
                        key={hit.food.id}
                        title={hit.food.canonical_name}
                        sub={
                          hit.energy_kcal_per_100g != null
                            ? `${Math.round(hit.energy_kcal_per_100g)} kcal / 100g`
                            : 'no kcal recorded'
                        }
                        onClick={() => pickFood(hit)}
                      />
                    ))
                  )}
                </Section>
              </div>
            ) : (
              <div className="space-y-3">
                {source && (
                  <div className="flex items-center gap-2 rounded-lg border border-teal-400/30 bg-teal-400/5 px-3 py-2 text-xs text-foreground/75">
                    <Utensils className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                    Linked to your {source.type === 'recipe' ? 'recipe' : 'food library'}
                    <button
                      type="button"
                      onClick={() => setSource(null)}
                      className="ml-auto text-foreground/45 underline hover:text-foreground"
                    >
                      unlink
                    </button>
                  </div>
                )}
                <Field label="Meal">
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. 2 rotis with dal"
                    className={inputCls}
                  />
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Qty">
                    <input
                      type="number"
                      min={0}
                      step="0.25"
                      inputMode="decimal"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="2"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Unit">
                    <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="katori" className={inputCls} />
                  </Field>
                  <Field label="kcal">
                    <input
                      type="number"
                      min={0}
                      value={kcal}
                      onChange={(e) => setKcal(e.target.value)}
                      placeholder="320"
                      className={inputCls}
                    />
                  </Field>
                </div>
                <Field label="Note for the client (optional)">
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. eat within 30 min of waking"
                    className={inputCls}
                  />
                </Field>
                <Field label="Ingredients (optional)">
                  <input
                    value={ingredients}
                    onChange={(e) => setIngredients(e.target.value)}
                    placeholder="wheat flour, toor dal, ghee"
                    className={inputCls}
                  />
                </Field>

                <div className="flex items-center justify-end gap-3 pt-2">
                  {onDelete && (
                    <button
                      type="button"
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await onDelete();
                          onClose();
                        } catch (err) {
                          toast.error((err as Error).message ?? 'Could not remove');
                        } finally {
                          setBusy(false);
                        }
                      }}
                      disabled={busy}
                      className="mr-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={busy}
                    className="rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/70 hover:bg-foreground/[0.04] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={busy || !name.trim()}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-40 disabled:hover:scale-100"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Save' : 'Add meal'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Glass>
      </motion.div>
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-foreground/70">{label}</div>
      {children}
    </label>
  );
}

function ModeTab({
  icon: Icon, label, active, onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors',
        active ? 'bg-foreground/[0.08] text-foreground' : 'text-foreground/60 hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function Section({ title, loading, children }: { title: string; loading?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-foreground/45">
        {title}
        {loading && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function PickRow({ title, sub, onClick }: { title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] px-3 py-2 text-left transition-colors hover:border-teal-400/40 hover:bg-teal-400/[0.06]"
    >
      <span className="truncate text-sm">{title}</span>
      <span className="shrink-0 text-[11px] text-foreground/50">{sub}</span>
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-1 py-2 text-xs text-foreground/45">{children}</div>;
}
