import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import { nutritionApi, type CookingMethodCode } from '@/modules/workspace/api/nutrition';
import { recipesApi, type UpsertRecipeIngredientInput } from '@/modules/workspace/api/recipes';

/**
 * RecipeImportDialog — bulk import recipes from a spreadsheet (CSV or XLSX).
 *
 * Expected columns (header row required, case-insensitive):
 *   recipe_name  |  servings  |  category  |  ingredient  |  quantity_g  |  cooking_method
 *
 * One row per ingredient. Rows with the same recipe_name are grouped into one
 * recipe. Each ingredient is resolved against the food library; rows that
 * can't be matched confidently are flagged but don't block the import — the
 * affected recipe is skipped with a clear reason.
 */
interface RecipeImportDialogProps {
  onClose: () => void;
}

interface RawRow {
  recipe_name: string;
  servings: number;
  category: string | null;
  ingredient: string;
  quantity_g: number;
  cooking_method: CookingMethodCode;
}

interface ResolvedIngredient {
  raw_name: string;
  food_id: string | null;
  matched_canonical_name: string | null;
  similarity: number;
  status: 'ok' | 'weak' | 'missing';
  quantity_g: number;
  cooking_method: CookingMethodCode;
}

interface ResolvedRecipe {
  recipe_name: string;
  servings: number;
  category: string | null;
  ingredients: ResolvedIngredient[];
  blocking_reason: string | null;
}

const VALID_METHODS = new Set<CookingMethodCode>([
  'raw', 'boiled', 'steamed', 'grilled', 'roasted', 'baked',
  'sauteed', 'pan_fried', 'deep_fried', 'stir_fried', 'curried',
  'tandoor', 'pressure_cooked', 'microwaved', 'fermented',
]);

const MATCH_THRESHOLD = 0.45;
const STRONG_THRESHOLD = 0.7;

export function RecipeImportDialog({ onClose }: RecipeImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const [step, setStep] = useState<'pick' | 'parsing' | 'preview' | 'submitting' | 'done'>('pick');
  const [recipes, setRecipes] = useState<ResolvedRecipe[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [errors, setErrors] = useState<Array<{ recipe_name: string; reason: string }>>([]);

  async function handleFile(file: File) {
    setStep('parsing');
    try {
      const raw = await parseSpreadsheet(file);
      const grouped = groupRecipes(raw);
      const resolved = await resolveAllRecipes(grouped);
      setRecipes(resolved);
      setStep('preview');
    } catch (err) {
      toast.error((err as Error).message);
      setStep('pick');
    }
  }

  async function handleSubmit() {
    const importable = recipes.filter((r) => !r.blocking_reason);
    if (importable.length === 0) {
      toast.error('Nothing to import — every recipe has unresolved ingredients.');
      return;
    }
    setStep('submitting');
    setProgress({ done: 0, total: importable.length, failed: 0 });
    const fails: Array<{ recipe_name: string; reason: string }> = [];

    for (const r of importable) {
      try {
        const ingredients: UpsertRecipeIngredientInput[] = r.ingredients.map((ing, idx) => ({
          food_id: ing.food_id as string,
          quantity_g: ing.quantity_g,
          cooking_method: ing.cooking_method,
          quantity_state: 'as_consumed',
          sort_order: idx,
        }));
        await recipesApi.create({
          name: r.recipe_name,
          servings: r.servings,
          category: r.category,
          ingredients,
        });
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        fails.push({ recipe_name: r.recipe_name, reason: msg });
        setProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
      }
    }

    setErrors(fails);
    setStep('done');
    void queryClient.invalidateQueries({ queryKey: ['recipes'] });
    if (fails.length === 0) {
      toast.success(`Imported ${importable.length} recipe${importable.length === 1 ? '' : 's'}.`);
    } else {
      toast.error(`Imported ${importable.length - fails.length} of ${importable.length}. ${fails.length} failed.`);
    }
  }

  const okCount = recipes.filter((r) => !r.blocking_reason).length;
  const skipCount = recipes.filter((r) => !!r.blocking_reason).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ">
      <Glass className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-medium">Import recipes from spreadsheet</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-foreground/45 hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {step === 'pick' && (
            <PickStep
              fileRef={fileRef}
              onFile={handleFile}
            />
          )}
          {step === 'parsing' && (
            <CenteredStatus icon={<Loader2 className="h-5 w-5 animate-spin" />} text="Parsing and matching ingredients…" />
          )}
          {step === 'preview' && (
            <PreviewStep recipes={recipes} okCount={okCount} skipCount={skipCount} />
          )}
          {step === 'submitting' && (
            <CenteredStatus
              icon={<Loader2 className="h-5 w-5 animate-spin" />}
              text={`Importing ${progress.done + 1} of ${progress.total}…`}
            />
          )}
          {step === 'done' && (
            <DoneStep
              imported={progress.done - progress.failed}
              total={progress.total}
              errors={errors}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-foreground/[0.06] px-5 py-3">
          {step === 'pick' && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs text-foreground/75 hover:border-foreground/15"
            >
              Cancel
            </button>
          )}
          {step === 'preview' && (
            <>
              <button
                type="button"
                onClick={() => setStep('pick')}
                className="rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs text-foreground/75 hover:border-foreground/15"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={okCount === 0}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full bg-violet-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-600',
                  okCount === 0 && 'cursor-not-allowed opacity-60',
                )}
              >
                <Upload className="h-3 w-3" />
                Import {okCount} recipe{okCount === 1 ? '' : 's'}
                {skipCount > 0 && <span className="ml-1 text-white/70">({skipCount} skipped)</span>}
              </button>
            </>
          )}
          {step === 'done' && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-full bg-violet-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-600"
            >
              Close
            </button>
          )}
        </div>
      </Glass>
    </div>
  );
}

// ─── Steps ───────────────────────────────────────────────────────────

function PickStep({
  fileRef, onFile,
}: {
  fileRef: React.RefObject<HTMLInputElement>;
  onFile: (f: File) => void;
}) {
  return (
    <div className="space-y-5 p-5">
      <p className="text-sm text-foreground/75">
        Upload a CSV or XLSX file. Each row is one ingredient. Rows sharing the same
        <code className="mx-1 rounded bg-foreground/[0.06] px-1 py-0.5 text-[11px]">recipe_name</code>
        are grouped into one recipe.
      </p>

      <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.015] p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
          Expected columns
        </div>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-foreground/[0.04] p-3 text-[11px] leading-relaxed text-foreground/85">
{`recipe_name,servings,category,ingredient,quantity_g,cooking_method
Chapati,4,Breakfast,Wheat flour (whole),120,pan_fried
Chapati,4,Breakfast,Water,60,raw
Chapati,4,Breakfast,Vegetable oil,8,raw
Dosa,2,Breakfast,Rice raw,100,fermented
Dosa,2,Breakfast,Black gram dal,40,fermented`}
        </pre>
        <ul className="mt-3 space-y-1 text-[11px] text-foreground/60">
          <li><code className="text-foreground/85">cooking_method</code> must be one of: raw, boiled, steamed, grilled, roasted, baked, sauteed, pan_fried, deep_fried, stir_fried, curried, tandoor, pressure_cooked, microwaved, fermented</li>
          <li><code className="text-foreground/85">category</code> is optional (e.g. Breakfast, Snack)</li>
          <li>Quantities are in grams, as-consumed</li>
        </ul>
      </div>

      <label
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-foreground/15 p-8 text-center transition-colors hover:border-violet-500/40 hover:bg-foreground/[0.02]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
      >
        <Upload className="h-6 w-6 text-foreground/40" />
        <div className="text-sm text-foreground/75">
          <span className="font-medium text-foreground">Click to choose</span> or drag a file here
        </div>
        <div className="text-[11px] text-foreground/45">CSV, XLS, XLSX</div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xls,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>
    </div>
  );
}

function PreviewStep({
  recipes, okCount, skipCount,
}: {
  recipes: ResolvedRecipe[];
  okCount: number;
  skipCount: number;
}) {
  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1 text-emerald-500">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {okCount} ready
        </span>
        {skipCount > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-500">
            <AlertTriangle className="h-3.5 w-3.5" />
            {skipCount} skipped (unresolved ingredients)
          </span>
        )}
      </div>

      <ul className="space-y-3">
        {recipes.map((r, idx) => (
          <li
            key={`${r.recipe_name}-${idx}`}
            className={cn(
              'rounded-xl border p-3',
              r.blocking_reason
                ? 'border-amber-500/30 bg-amber-500/[0.04]'
                : 'border-foreground/[0.08] bg-foreground/[0.015]',
            )}
          >
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">{r.recipe_name}</div>
                <div className="mt-0.5 text-[11px] text-foreground/55">
                  {r.servings} serving{r.servings === 1 ? '' : 's'}
                  {r.category && <> · {r.category}</>}
                  {' · '}{r.ingredients.length} ingredient{r.ingredients.length === 1 ? '' : 's'}
                </div>
              </div>
              {r.blocking_reason ? (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-amber-500">
                  <AlertTriangle className="h-3 w-3" /> Skip
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-emerald-500">
                  <CheckCircle2 className="h-3 w-3" /> Ready
                </span>
              )}
            </div>
            {r.blocking_reason && (
              <div className="mt-2 text-[11px] text-amber-500/85">{r.blocking_reason}</div>
            )}
            <ul className="mt-2 divide-y divide-foreground/[0.05] text-xs">
              {r.ingredients.map((ing, i) => (
                <li key={i} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <StatusDot status={ing.status} />
                    <span className="text-foreground/75">{ing.raw_name}</span>
                    {ing.matched_canonical_name && ing.matched_canonical_name !== ing.raw_name && (
                      <span className="text-foreground/45">→ {ing.matched_canonical_name}</span>
                    )}
                  </div>
                  <span className="text-[11px] text-foreground/55 tabular-nums">
                    {ing.quantity_g}g · {ing.cooking_method}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DoneStep({
  imported, total, errors,
}: {
  imported: number;
  total: number;
  errors: Array<{ recipe_name: string; reason: string }>;
}) {
  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        Imported <span className="font-medium">{imported}</span> of {total} recipe{total === 1 ? '' : 's'}.
      </div>
      {errors.length > 0 && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.05] p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-rose-500">
            {errors.length} failed
          </div>
          <ul className="mt-2 space-y-1 text-xs text-foreground/75">
            {errors.map((e, i) => (
              <li key={i}>
                <span className="text-foreground">{e.recipe_name}</span>
                {' — '}
                <span className="text-foreground/55">{e.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CenteredStatus({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-12 text-sm text-foreground/65">
      {icon}
      {text}
    </div>
  );
}

function StatusDot({ status }: { status: ResolvedIngredient['status'] }) {
  if (status === 'ok') return <CheckCircle2 className="h-3 w-3 text-emerald-500" aria-label="matched" />;
  if (status === 'weak') return <AlertTriangle className="h-3 w-3 text-amber-500" aria-label="weak match" />;
  return <XCircle className="h-3 w-3 text-rose-500" aria-label="no match" />;
}

// ─── Parsing + resolution ────────────────────────────────────────────

// Accepted header spellings per logical column (all compared lowercased/trimmed).
const RECIPE_KEYS = ['recipe_name', 'recipe name', 'recipe', 'name', 'dish', 'dish_name'];
const INGREDIENT_KEYS = ['ingredient', 'ingredients', 'ingredient_name', 'food', 'food_name', 'item'];
const QUANTITY_KEYS = ['quantity_g', 'grams', 'quantity', 'qty', 'weight', 'weight_g', 'amount'];
const SERVINGS_KEYS = ['servings', 'serves', 'serving', 'portions'];
const CATEGORY_KEYS = ['category', 'meal', 'meal_type', 'type'];
const METHOD_KEYS = ['cooking_method', 'method', 'cooking', 'prep'];

async function parseSpreadsheet(file: File): Promise<RawRow[]> {
  // Load the spreadsheet parser (~330 KB) on demand — only when a file is
  // actually picked — so it never bloats the Recipes page load.
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('No sheet found in the file.');

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
  if (rows.length === 0) throw new Error('The sheet is empty.');

  // Validate the header once, up front, so a misnamed column gives a clear,
  // actionable error instead of a cryptic per-row "missing X".
  const detected = Object.keys(lowercaseKeys(rows[0]));
  const hasCol = (candidates: string[]) => candidates.some((c) => detected.includes(c));
  const missing: string[] = [];
  if (!hasCol(RECIPE_KEYS)) missing.push('recipe_name');
  if (!hasCol(INGREDIENT_KEYS)) missing.push('ingredient');
  if (!hasCol(QUANTITY_KEYS)) missing.push('quantity_g');
  if (missing.length > 0) {
    throw new Error(
      `Couldn't find the required column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}. ` +
        `Detected columns in your file: ${detected.length ? detected.join(', ') : '(none)'}. ` +
        `Make sure the first row is a header and rename your column${missing.length === 1 ? '' : 's'} to match.`,
    );
  }

  const out: RawRow[] = [];
  rows.forEach((raw, idx) => {
    const r = lowercaseKeys(raw);
    // Skip fully-blank spacer rows (common when exported from Excel) rather
    // than hard-failing the whole import on them.
    const isBlank = Object.values(r).every((v) => v == null || (typeof v === 'string' && !v.trim()));
    if (isBlank) return;

    const recipe_name = pickStr(r, RECIPE_KEYS);
    if (!recipe_name) throw new Error(`Row ${idx + 2}: missing recipe_name.`);
    const ingredient = pickStr(r, INGREDIENT_KEYS);
    if (!ingredient) throw new Error(`Row ${idx + 2}: missing ingredient.`);
    const quantity_g = pickNum(r, QUANTITY_KEYS);
    if (quantity_g == null) throw new Error(`Row ${idx + 2}: missing quantity_g.`);
    const cm = (pickStr(r, METHOD_KEYS) ?? 'raw').toLowerCase().replace(/[- ]/g, '_');
    const cooking_method = VALID_METHODS.has(cm as CookingMethodCode) ? (cm as CookingMethodCode) : 'raw';
    out.push({
      recipe_name,
      servings: pickNum(r, SERVINGS_KEYS) ?? 1,
      category: pickStr(r, CATEGORY_KEYS) ?? null,
      ingredient,
      quantity_g,
      cooking_method,
    });
  });
  if (out.length === 0) throw new Error('No data rows found below the header.');
  return out;
}

function groupRecipes(rows: RawRow[]): Array<{
  recipe_name: string;
  servings: number;
  category: string | null;
  rows: RawRow[];
}> {
  const map = new Map<string, { recipe_name: string; servings: number; category: string | null; rows: RawRow[] }>();
  for (const r of rows) {
    const key = r.recipe_name.toLowerCase();
    let group = map.get(key);
    if (!group) {
      group = { recipe_name: r.recipe_name, servings: r.servings, category: r.category, rows: [] };
      map.set(key, group);
    }
    group.rows.push(r);
  }
  return Array.from(map.values());
}

async function resolveAllRecipes(
  groups: Array<{ recipe_name: string; servings: number; category: string | null; rows: RawRow[] }>,
): Promise<ResolvedRecipe[]> {
  // Cache per-ingredient-string. Many recipes share the same ingredient (e.g.
  // wheat flour) — one lookup is enough.
  const cache = new Map<string, { food_id: string | null; name: string | null; similarity: number }>();

  async function resolve(q: string) {
    const key = q.toLowerCase().trim();
    const cached = cache.get(key);
    if (cached) return cached;
    try {
      const hits = await nutritionApi.searchFoods({ q, limit: 1 });
      if (hits.length === 0) {
        const miss = { food_id: null, name: null, similarity: 0 };
        cache.set(key, miss);
        return miss;
      }
      const top = hits[0];
      const r = {
        food_id: top.food.id,
        name: top.food.canonical_name,
        similarity: top.similarity,
      };
      cache.set(key, r);
      return r;
    } catch {
      const miss = { food_id: null, name: null, similarity: 0 };
      cache.set(key, miss);
      return miss;
    }
  }

  const result: ResolvedRecipe[] = [];
  for (const g of groups) {
    const ingredients: ResolvedIngredient[] = [];
    for (const row of g.rows) {
      const r = await resolve(row.ingredient);
      let status: ResolvedIngredient['status'] = 'missing';
      if (r.food_id) {
        status = r.similarity >= STRONG_THRESHOLD ? 'ok' : r.similarity >= MATCH_THRESHOLD ? 'weak' : 'missing';
      }
      ingredients.push({
        raw_name: row.ingredient,
        food_id: status === 'missing' ? null : r.food_id,
        matched_canonical_name: r.name,
        similarity: r.similarity,
        status,
        quantity_g: row.quantity_g,
        cooking_method: row.cooking_method,
      });
    }
    const unresolvedCount = ingredients.filter((i) => i.status === 'missing').length;
    result.push({
      recipe_name: g.recipe_name,
      servings: g.servings,
      category: g.category,
      ingredients,
      blocking_reason:
        unresolvedCount > 0
          ? `${unresolvedCount} ingredient${unresolvedCount === 1 ? '' : 's'} couldn't be matched to the food library.`
          : null,
    });
  }
  return result;
}

// ─── Helpers ────────────────────────────────────────────────────────

function lowercaseKeys(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k.trim().toLowerCase()] = v;
  return out;
}

function pickStr(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return null;
}

function pickNum(o: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}
