import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Loader2, Calculator, AlertCircle, BookOpen,
  HeartPulse, Sparkles, AlertTriangle, Info,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import {
  nutritionApi,
  CATEGORY_LABEL,
  COOKING_METHOD_LABEL,
  type CalculateOutput,
  type CookingMethodCode,
  type HealthSpec,
} from '@/modules/workspace/api/nutrition';
import { cn } from '@/lib/utils';

/**
 * FoodDetailView — single food deep-dive. Used in all three role contexts.
 *
 * Shows the full per-100g nutrient panel from food_nutrients, plus an
 * inline "calculate for portion" tool that runs CalculatorService and
 * displays the audit-backed result.
 */
interface FoodDetailViewProps {
  foodId: string;
  /** Back link target. */
  backHref: string;
}

export function FoodDetailView({ foodId, backHref }: FoodDetailViewProps) {
  const foodQ = useQuery({
    queryKey: ['nutrition', 'food', foodId],
    queryFn: () => nutritionApi.getFood(foodId),
    retry: 1,
  });

  if (foodQ.isLoading) {
    return (
      <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </Glass>
    );
  }
  if (foodQ.isError || !foodQ.data) {
    return (
      <Glass className="flex flex-col items-center gap-2 p-10 text-center">
        <AlertCircle className="h-6 w-6 text-rose-500" />
        <div className="text-sm">Couldn't load this food.</div>
        <Link to={backHref} className="text-xs text-foreground/65 underline">Back to library</Link>
      </Glass>
    );
  }

  const food = foodQ.data;
  const n = food.nutrients;

  return (
    <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
      className="space-y-5">
      <motion.div variants={fadeUp}>
        <Link to={backHref}
          className="inline-flex items-center gap-1.5 text-xs text-foreground/65 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to library
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          {food.canonical_name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <Badge tone="emerald">{food.source}</Badge>
          {food.source_id && <Badge tone="muted">{food.source_id}</Badge>}
          <Badge tone="muted">{CATEGORY_LABEL[food.category]}</Badge>
          <Badge tone="muted">measured {food.measurement_state}</Badge>
        </div>
        <p className="mt-3 text-xs text-foreground/65">
          All values per 100g edible portion.
          {food.edible_portion_fraction < 1 && (
            <> Edible portion: {Math.round(food.edible_portion_fraction * 100)}% (inedible mass like peel/shell excluded).</>
          )}
        </p>
      </motion.div>

      {/* Macro KPI tiles */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <KpiTile label="Energy"  value={n.energy_kcal} unit="kcal" accent="from-amber-400 to-orange-500" />
        <KpiTile label="Protein" value={n.protein_g}        unit="g" accent="from-rose-400 to-pink-500" />
        <KpiTile label="Carbs"   value={n.carbohydrate_g}   unit="g" accent="from-sky-400 to-blue-500" />
        <KpiTile label="Fat"     value={n.fat_g}            unit="g" accent="from-teal-400 to-cyan-500" />
        <KpiTile label="Fiber"   value={n.fiber_g ?? null}  unit="g" accent="from-emerald-400 to-teal-500" />
      </motion.div>

      {/* Health & suitability */}
      {food.health && (
        <motion.div variants={fadeUp}>
          <HealthSection health={food.health} />
        </motion.div>
      )}

      {/* Calculate-for-portion */}
      <motion.div variants={fadeUp}>
        <CalculateForPortion foodId={food.id} foodName={food.canonical_name} />
      </motion.div>

      {/* Nutrient panel grouped */}
      <motion.div variants={fadeUp}>
        <Glass className="p-5">
          <h2 className="mb-4 text-sm font-semibold">Full nutrient panel</h2>

          <NutrientGroup title="Proximate" entries={[
            ['Water',        n.water_g,        'g'],
            ['Ash',          n.ash_g,          'g'],
            ['Sugar',        n.sugar_g,        'g'],
            ['Starch',       n.starch_g,       'g'],
            ['Saturated fat',n.saturated_fat_g,'g'],
            ['MUFA',         n.mufa_g,         'g'],
            ['PUFA',         n.pufa_g,         'g'],
            ['Trans fat',    n.trans_fat_g,    'g'],
            ['Cholesterol',  n.cholesterol_mg, 'mg'],
            ['Glycemic index', n.glycemic_index, ''],
          ]} />

          <NutrientGroup title="Minerals" entries={[
            ['Sodium',     n.sodium_mg,     'mg'],
            ['Potassium',  n.potassium_mg,  'mg'],
            ['Calcium',    n.calcium_mg,    'mg'],
            ['Iron',       n.iron_mg,       'mg'],
            ['Magnesium',  n.magnesium_mg,  'mg'],
            ['Phosphorus', n.phosphorus_mg, 'mg'],
            ['Zinc',       n.zinc_mg,       'mg'],
            ['Copper',     n.copper_mg,     'mg'],
            ['Manganese',  n.manganese_mg,  'mg'],
            ['Selenium',   n.selenium_mcg,  'µg'],
            ['Iodine',     n.iodine_mcg,    'µg'],
            ['Chromium',   n.chromium_mcg,  'µg'],
          ]} />

          <NutrientGroup title="Vitamins" entries={[
            ['Vitamin A (RAE)', n.vit_a_mcg_rae,         'µg'],
            ['Vitamin D',       n.vit_d_mcg,             'µg'],
            ['Vitamin E',       n.vit_e_mg,              'mg'],
            ['Vitamin K',       n.vit_k_mcg,             'µg'],
            ['Vitamin C',       n.vit_c_mg,              'mg'],
            ['Thiamin (B1)',    n.vit_b1_thiamin_mg,     'mg'],
            ['Riboflavin (B2)', n.vit_b2_riboflavin_mg,  'mg'],
            ['Niacin (B3)',     n.vit_b3_niacin_mg,      'mg'],
            ['Pantothenic (B5)',n.vit_b5_pantothenic_mg, 'mg'],
            ['B6 (Pyridoxine)', n.vit_b6_pyridoxine_mg,  'mg'],
            ['Biotin (B7)',     n.vit_b7_biotin_mcg,     'µg'],
            ['Folate (B9)',     n.vit_b9_folate_mcg,     'µg'],
            ['B12 (Cobalamin)', n.vit_b12_cobalamin_mcg, 'µg'],
            ['Choline',         n.choline_mg,            'mg'],
          ]} />
        </Glass>
      </motion.div>
    </motion.div>
  );
}

// ─── Health & suitability ───────────────────────────────────────────

function HealthSection({ health }: { health: HealthSpec }) {
  const { summary, good_for, benefits, cautions, disclaimer } = health;
  return (
    <Glass className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <HeartPulse className="h-4 w-4 text-rose-500 dark:text-rose-300" />
        <h2 className="text-sm font-semibold">Health &amp; suitability</h2>
      </div>

      {summary && (
        <p className="mb-4 text-sm leading-relaxed text-foreground/85">{summary}</p>
      )}

      {good_for.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/55">Good for</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {good_for.map((c) => (
              <div
                key={c.label}
                className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2"
              >
                <div className="text-sm font-medium text-emerald-800 dark:text-emerald-200">{c.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-foreground/65">{c.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {benefits.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-foreground/55">
            <Sparkles className="h-3 w-3 text-teal-500 dark:text-teal-300" /> Notable nutrients
          </div>
          <div className="flex flex-wrap gap-1.5">
            {benefits.map((b) => (
              <span
                key={b}
                className="rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 py-0.5 text-[11px] text-foreground/80"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      )}

      {cautions.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-foreground/55">
            <AlertTriangle className="h-3 w-3 text-amber-500 dark:text-amber-300" /> Eat mindfully
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cautions.map((c) => (
              <span
                key={c}
                className="rounded-full border border-amber-500/25 bg-amber-500/[0.08] px-2.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-200"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 border-t border-foreground/[0.06] pt-3 text-[11px] text-foreground/55">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <span>{disclaimer}</span>
      </div>
    </Glass>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────

function KpiTile({ label, value, unit, accent }: {
  label: string; value: number | null; unit: string; accent: string;
}) {
  return (
    <Glass className="flex flex-col items-center gap-1 p-3 text-center">
      <div className={cn('h-1 w-8 rounded-full bg-gradient-to-r', accent)} />
      <div className="text-xl font-semibold tabular-nums">
        {value == null ? '—' : Math.round(value * 100) / 100}
        {value != null && unit && <span className="ml-0.5 text-[11px] font-normal text-foreground/55">{unit}</span>}
      </div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-foreground/55">{label}</div>
    </Glass>
  );
}

function NutrientGroup({
  title, entries,
}: { title: string; entries: Array<[string, number | null, string]> }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/55">{title}</div>
      <div className="grid grid-cols-2 gap-y-1 text-xs sm:grid-cols-3">
        {entries.map(([label, value, unit]) => (
          <div key={label} className="flex items-baseline justify-between gap-2 border-b border-foreground/[0.04] py-1.5 pr-3">
            <span className="text-foreground/65">{label}</span>
            <span className="font-medium tabular-nums">
              {value == null ? <span className="text-foreground/30">—</span> : (
                <>
                  {Math.round(value * 1000) / 1000}
                  {unit && <span className="ml-0.5 text-[10px] font-normal text-foreground/55">{unit}</span>}
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Calculate-for-portion inline tool ─────────────────────────────

const COOKING_METHODS: CookingMethodCode[] = [
  'raw', 'boiled', 'steamed', 'grilled', 'roasted', 'baked', 'sauteed',
  'pan_fried', 'deep_fried', 'stir_fried', 'curried', 'tandoor',
  'pressure_cooked', 'microwaved', 'fermented',
];

function CalculateForPortion({ foodId, foodName }: { foodId: string; foodName: string }) {
  const [grams, setGrams] = useState('100');
  const [method, setMethod] = useState<CookingMethodCode>('raw');
  const [state, setState] = useState<'as_consumed' | 'raw'>('as_consumed');

  const calcMut = useMutation<CalculateOutput, Error, void>({
    mutationFn: () => nutritionApi.calculate({
      food_id: foodId,
      quantity_g: Number(grams),
      cooking_method: method,
      quantity_state: state,
    }),
    onError: (err) => toast.error(err.message ?? 'Calculation failed.'),
  });

  const result = calcMut.data;

  return (
    <Glass className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Calculator className="h-4 w-4 text-teal-600 dark:text-teal-300" />
        <h2 className="text-sm font-semibold">Calculate for portion</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Grams">
          <input
            type="number" inputMode="decimal" min={1} max={2000} value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm focus:border-teal-400/60 focus:outline-none"
          />
        </Field>
        <Field label="Cooking method">
          <select
            value={method} onChange={(e) => setMethod(e.target.value as CookingMethodCode)}
            className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm focus:border-teal-400/60 focus:outline-none"
          >
            {COOKING_METHODS.map((m) => (
              <option key={m} value={m}>{COOKING_METHOD_LABEL[m]}</option>
            ))}
          </select>
        </Field>
        <Field label="Weight is">
          <select
            value={state} onChange={(e) => setState(e.target.value as 'as_consumed' | 'raw')}
            className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm focus:border-teal-400/60 focus:outline-none"
          >
            <option value="as_consumed">As consumed (cooked)</option>
            <option value="raw">Raw (pre-cook)</option>
          </select>
        </Field>
        <Field label="&nbsp;">
          <button
            type="button"
            onClick={() => calcMut.mutate()}
            disabled={calcMut.isPending || !Number(grams)}
            className="w-full rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {calcMut.isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Calculate'}
          </button>
        </Field>
      </div>

      {result && (
        <div className="mt-4 space-y-3 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
            Engine result · {Number(grams)}g of {foodName} ({COOKING_METHOD_LABEL[method].toLowerCase()})
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <ResultStat label="kcal"    value={result.nutrients.energy_kcal} />
            <ResultStat label="Protein" value={result.nutrients.protein_g}      unit="g" />
            <ResultStat label="Carbs"   value={result.nutrients.carbohydrate_g} unit="g" />
            <ResultStat label="Fat"     value={result.nutrients.fat_g}          unit="g" />
          </div>
          <div className="border-t border-foreground/[0.05] pt-2 text-[11px] text-foreground/65">
            Effective weight: {result.effective_weight_g}g
            {result.oil_added_g > 0 && <> · Oil added: {result.oil_added_g}g</>}
            {result.provenance.cooking_yield_factor != null && (
              <> · Yield ×{result.provenance.cooking_yield_factor}</>
            )}
            <div className="mt-1 inline-flex items-center gap-1 text-foreground/45">
              <BookOpen className="h-2.5 w-2.5" /> Audit {result.audit_id.slice(0, 8)}…
            </div>
          </div>
        </div>
      )}
    </Glass>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-foreground/55">{label}</div>
      {children}
    </label>
  );
}

function ResultStat({ label, value, unit }: { label: string; value: number; unit?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">
        {Math.round(value * 100) / 100}
        {unit && <span className="ml-0.5 text-[10px] font-normal text-foreground/55">{unit}</span>}
      </div>
    </div>
  );
}

function Badge({ tone, children }: { tone: 'emerald' | 'muted'; children: React.ReactNode }) {
  const cls = tone === 'emerald'
    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    : 'bg-foreground/[0.05] text-foreground/75';
  return (
    <span className={cn('rounded-full px-2 py-0.5 uppercase tracking-[0.14em]', cls)}>
      {children}
    </span>
  );
}
