import { useMemo, useState, type ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search, Loader2, BookOpen, LayoutGrid, List, ChevronRight, Download,
  Leaf, Wheat, Fish, Apple, Milk, Beef, Egg, Droplets, CupSoda, Utensils,
  Carrot, Cookie, Candy, Soup, Flame, Drumstick, Salad, Bean, Nut,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import {
  nutritionApi,
  CATEGORY_LABEL,
  CATEGORY_LIST,
  type FoodSearchHit,
  type FoodCategory,
  type FoodSource,
  type FoodSummary,
  type MacroSummary,
} from '@/modules/workspace/api/nutrition';
import { cn } from '@/lib/utils';

/**
 * FoodLibrary — "clinical-calm" aesthetic (deep-teal accent).
 *
 * Design ethos:
 *   - One accent (teal) used with intent; category colour is a quiet signal.
 *   - Each card leads with its category icon + tinted left rail, then makes
 *     kcal the hero with a compact protein/carb/fat micro-bar beside it.
 *   - Category is a horizontal chip rail (with live counts), not a hidden
 *     dropdown — one tap to filter across 20 food groups.
 *   - Two views: grid (cards) and list (compact table) toggleable.
 *
 * Used in three contexts:
 *   - Nutritionist  → /dashboard/nutrition/foods
 *   - Client        → /portal/foods
 *   - Super admin   → /admin/nutrition/foods
 */
interface FoodLibraryProps {
  detailHrefBase: string;
  heroEyebrow: string;
}

type ViewMode = 'grid' | 'list';

export function FoodLibrary({ detailHrefBase, heroEyebrow }: FoodLibraryProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FoodCategory | 'all'>('all');
  const [source, setSource] = useState<FoodSource | 'all'>('all');
  const [view, setView] = useState<ViewMode>('grid');

  // Always fetch the *unfiltered* set for the current query so the category
  // rail can show live per-category counts; category/source filter client-side.
  const searchQ = useQuery({
    queryKey: ['nutrition', 'foods', 'search', query],
    queryFn: () => nutritionApi.searchFoods({ q: query.trim(), limit: 500 }),
    retry: 1,
    staleTime: 30_000,
  });

  const hits = useMemo(() => searchQ.data ?? [], [searchQ.data]);

  // Per-category counts (over the source-filtered set) for the rail.
  const bySource = useMemo(
    () => (source === 'all' ? hits : hits.filter((h) => h.food.source === source)),
    [hits, source],
  );
  const counts = useMemo(() => {
    const m = new Map<FoodCategory, number>();
    for (const h of bySource) m.set(h.food.category, (m.get(h.food.category) ?? 0) + 1);
    return m;
  }, [bySource]);

  const filtered = useMemo(
    () => (category === 'all' ? bySource : bySource.filter((h) => h.food.category === category)),
    [bySource, category],
  );

  // Categories present in the current result set, ordered by the canonical list.
  const railCategories = useMemo(
    () => CATEGORY_LIST.filter((c) => (counts.get(c) ?? 0) > 0),
    [counts],
  );

  const avgKcal = useMemo(() => {
    const withKcal = filtered.filter((h) => h.energy_kcal_per_100g != null);
    if (withKcal.length === 0) return null;
    return Math.round(
      withKcal.reduce((s, h) => s + (h.energy_kcal_per_100g ?? 0), 0) / withKcal.length,
    );
  }, [filtered]);

  return (
    <motion.div
      variants={stagger(0.06, 0.05)}
      initial="initial"
      animate="animate"
      className="space-y-5"
    >
      {/* Header */}
      <motion.div variants={fadeUp}>
        <span className="text-[11px] uppercase tracking-[0.22em] text-foreground/45">
          {heroEyebrow}
        </span>
        <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">Food library</h1>
        <p className="mt-2 max-w-2xl text-sm text-foreground/60">
          Sourced from <span className="text-foreground/85">IFCT 2017</span> (NIN / ICMR) and USDA FoodData Central. Click a food for its full nutrient panel and provenance.
        </p>
      </motion.div>

      {/* Summary strip — sense of scale over the dense list */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground/55">
        <span><b className="font-semibold tabular-nums text-foreground">{hits.length.toLocaleString()}</b> foods</span>
        <Dot />
        <span><b className="font-semibold tabular-nums text-foreground">{railCategories.length}</b> categories</span>
        {avgKcal != null && (<><Dot /><span>avg <b className="font-semibold tabular-nums text-foreground">{avgKcal}</b> kcal · 100g</span></>)}
        <Dot />
        <span>IFCT 2017 · USDA FDC</span>
      </motion.div>

      {/* Search + source + view toggle */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or alias…"
            className="w-full rounded-xl border border-foreground/[0.08] bg-transparent px-10 py-2.5 text-sm placeholder:text-foreground/35 focus:border-teal-600/45 focus:outline-none focus:ring-2 focus:ring-teal-600/10"
          />
        </div>

        <div className="flex items-center gap-2">
          <FilterPill
            label="Source"
            value={source === 'all' ? 'All' : source}
            options={[
              { label: 'All',         value: 'all' },
              { label: 'IFCT 2017',   value: 'IFCT-2017' },
              { label: 'USDA FDC',    value: 'USDA-FDC' },
              { label: 'Custom',      value: 'CUSTOM-APPROVED' },
            ]}
            onPick={(v) => setSource(v as FoodSource | 'all')}
          />
          <button
            type="button"
            onClick={async () => {
              if (filtered.length === 0) {
                toast.error('No foods to export.');
                return;
              }
              try {
                // Load the PDF engine (jspdf + autotable, ~300 KB) on demand
                // so it never weighs down the initial page load.
                const { generateFoodLibraryPdf } = await import(
                  '@/modules/nutrition/foodLibraryPdf'
                );
                await generateFoodLibraryPdf({
                  foods: filtered.map((h) => h.food),
                  category, source, query,
                });
              } catch (err) {
                toast.error((err as Error).message ?? 'Could not generate the PDF.');
              }
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs',
              'text-foreground/85 transition-colors hover:border-foreground/15 hover:bg-foreground/[0.03]',
            )}
            title="Download the current filtered list as a PDF"
          >
            <Download className="h-3 w-3" />
            PDF
          </button>
          <div className="flex items-center rounded-full border border-foreground/[0.08] p-0.5">
            <ViewToggleButton active={view === 'grid'} onClick={() => setView('grid')} icon={LayoutGrid} label="Grid" />
            <ViewToggleButton active={view === 'list'} onClick={() => setView('list')} icon={List}       label="List" />
          </div>
        </div>
      </motion.div>

      {/* Category rail — replaces the hidden dropdown */}
      {railCategories.length > 0 && (
        <motion.div variants={fadeUp}>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <CategoryChip
              active={category === 'all'}
              onClick={() => setCategory('all')}
              label="All"
              count={bySource.length}
            />
            {railCategories.map((c) => (
              <CategoryChip
                key={c}
                active={category === c}
                onClick={() => setCategory((prev) => (prev === c ? 'all' : c))}
                label={CATEGORY_LABEL[c]}
                count={counts.get(c) ?? 0}
                category={c}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* Content */}
      <motion.div variants={fadeUp}>
        {searchQ.isLoading ? (
          <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </Glass>
        ) : filtered.length === 0 ? (
          <Glass className="flex flex-col items-center gap-2 p-10 text-center">
            <BookOpen className="h-6 w-6 text-foreground/30" />
            <div className="text-sm text-foreground/55">
              {query ? `No foods match "${query}".` : 'No foods found.'}
            </div>
          </Glass>
        ) : view === 'grid' ? (
          <GridView foods={filtered} hrefBase={detailHrefBase} />
        ) : (
          <ListView foods={filtered} hrefBase={detailHrefBase} />
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Grid view — refined cards ─────────────────────────────────────

function GridView({ foods, hrefBase }: { foods: FoodSearchHit[]; hrefBase: string }) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {foods.map((h) => (
        <FoodCard
          key={h.food.id}
          food={h.food}
          kcal={h.energy_kcal_per_100g}
          macros={h.macros}
          goodFor={h.good_for}
          href={`${hrefBase}/${h.food.id}`}
        />
      ))}
    </div>
  );
}

function FoodCard({
  food, kcal, macros, goodFor, href,
}: {
  food: FoodSummary;
  kcal: number | null;
  macros?: MacroSummary;
  goodFor?: string[];
  href: string;
}) {
  const meta = CATEGORY_META[food.category];
  const Icon = meta.icon;
  return (
    <Link
      to={href}
      className={cn(
        'group relative flex flex-col rounded-2xl border border-foreground/[0.07] bg-foreground/[0.012] p-4 pl-[18px]',
        'overflow-hidden transition-[transform,box-shadow,border-color] duration-200',
        'hover:-translate-y-0.5 hover:border-teal-600/30 hover:shadow-[0_10px_30px_-16px_rgba(14,26,36,0.30)]',
      )}
    >
      {/* Category-tinted left rail */}
      <span className={cn('absolute inset-y-0 left-0 w-[3px]', meta.rail)} />

      {/* Top row: category icon + name + code */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={cn('grid h-7 w-7 place-items-center rounded-lg', meta.tint, meta.fg)}>
            <Icon className="h-[15px] w-[15px]" />
          </span>
          <span className="text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-foreground/50">
            {CATEGORY_LABEL[food.category]}
          </span>
        </div>
        {food.source_id && (
          <span className="font-mono text-[10px] tabular-nums text-foreground/35">
            {food.source_id}
          </span>
        )}
      </div>

      {/* Food name */}
      <div className="mt-3.5 min-h-[2.5rem]">
        <div className="text-sm font-semibold leading-snug tracking-[-0.01em] text-foreground line-clamp-2">
          {food.canonical_name}
        </div>
      </div>

      {/* Energy hero + macro micro-bar */}
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <span className="bg-gradient-to-b from-foreground to-teal-600 bg-clip-text text-2xl font-bold tabular-nums tracking-[-0.02em] text-transparent">
            {kcal == null ? '—' : Math.round(kcal)}
          </span>
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-foreground/45">
            kcal · 100g
          </span>
        </div>
        <MacroBar macros={macros} />
      </div>

      {/* "Good for" chips — rule-derived from the nutrient profile */}
      {goodFor && goodFor.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {goodFor.map((g) => (
            <span
              key={g}
              className="rounded-full border border-teal-600/20 bg-teal-600/[0.07] px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-300"
            >
              {g}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between border-t border-foreground/[0.05] pt-2.5 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
        <span>
          {food.source}
          {food.measurement_state !== 'as_consumed' && (
            <span className="ml-1.5 text-foreground/35">· {food.measurement_state}</span>
          )}
        </span>
        <ChevronRight className="h-3 w-3 text-foreground/30 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-600" />
      </div>
    </Link>
  );
}

/** Compact protein/carb/fat ratio bar. Renders quietly if macros are absent. */
function MacroBar({ macros }: { macros?: MacroSummary }) {
  const p = macros?.protein_g ?? 0;
  const c = macros?.carbohydrate_g ?? 0;
  const f = macros?.fat_g ?? 0;
  const total = p + c + f;
  if (total <= 0) {
    return (
      <div className="w-[74px]">
        <div className="mb-1 flex justify-between text-[8.5px] uppercase tracking-wide text-foreground/25">
          <span>P</span><span>C</span><span>F</span>
        </div>
        <div className="h-[5px] rounded-full bg-foreground/[0.06]" />
      </div>
    );
  }
  const pct = (v: number) => `${(v / total) * 100}%`;
  return (
    <div className="w-[74px]">
      <div className="mb-1 flex justify-between text-[8.5px] uppercase tracking-wide text-foreground/35">
        <span>P</span><span>C</span><span>F</span>
      </div>
      <div className="flex h-[5px] overflow-hidden rounded-full bg-foreground/[0.06]">
        <span className="h-full bg-rose-400" style={{ width: pct(p) }} />
        <span className="h-full bg-sky-400" style={{ width: pct(c) }} />
        <span className="h-full bg-teal-500" style={{ width: pct(f) }} />
      </div>
    </div>
  );
}

// ─── List view — compact ─────────────────────────────────────

function ListView({ foods, hrefBase }: { foods: FoodSearchHit[]; hrefBase: string }) {
  return (
    <Glass className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="border-b border-foreground/[0.06] text-[10px] uppercase tracking-[0.18em] text-foreground/45">
            <tr>
              <th className="px-4 py-3 text-left font-normal">Code</th>
              <th className="px-4 py-3 text-left font-normal">Food</th>
              <th className="px-4 py-3 text-left font-normal">Category</th>
              <th className="px-4 py-3 text-right font-normal">kcal/100g</th>
              <th className="px-4 py-3 text-left font-normal">Source</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {foods.map((h) => (
              <FoodRow
                key={h.food.id}
                food={h.food}
                kcal={h.energy_kcal_per_100g}
                href={`${hrefBase}/${h.food.id}`}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Glass>
  );
}

function FoodRow({ food, kcal, href }: { food: FoodSummary; kcal: number | null; href: string }) {
  const meta = CATEGORY_META[food.category];
  const Icon = meta.icon;
  return (
    <tr className="border-b border-foreground/[0.04] last:border-0 transition-colors hover:bg-foreground/[0.025]">
      <td className="px-4 py-2.5 font-mono text-[11px] tabular-nums text-foreground/55">
        {food.source_id ?? '—'}
      </td>
      <td className="px-4 py-2.5">
        <Link to={href} className="group flex items-center gap-2.5">
          <span className={cn('grid h-6 w-6 flex-shrink-0 place-items-center rounded-md', meta.tint, meta.fg)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm text-foreground group-hover:text-teal-600">
              {food.canonical_name}
            </div>
            {food.measurement_state !== 'as_consumed' && (
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-foreground/40">
                {food.measurement_state}
              </div>
            )}
          </div>
        </Link>
      </td>
      <td className="px-4 py-2.5 text-xs text-foreground/65">
        {CATEGORY_LABEL[food.category]}
      </td>
      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">
        {kcal == null ? <span className="text-foreground/35">—</span> : Math.round(kcal)}
      </td>
      <td className="px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-foreground/55">
        {food.source}
      </td>
      <td className="px-4 py-2.5 text-right">
        <Link to={href} className="inline-flex items-center text-foreground/35 hover:text-teal-600">
          <ChevronRight className="h-4 w-4" />
        </Link>
      </td>
    </tr>
  );
}

// ─── Category metadata — icon + colour per food group ───────────────
// A small icon + tinted left rail acts as the chromatic signal, keeping the
// dense grid scannable by food group while the cards stay calm.

interface CategoryMeta {
  icon: ComponentType<{ className?: string }>;
  rail: string;  // left-rail background
  tint: string;  // icon chip background
  fg: string;    // icon colour
  dot: string;   // rail-chip dot
}

const CATEGORY_META: Record<FoodCategory, CategoryMeta> = {
  cereals:           { icon: Wheat,    rail: 'bg-amber-500',   tint: 'bg-amber-500/10',   fg: 'text-amber-600',   dot: 'bg-amber-500' },
  pulses:            { icon: Bean,     rail: 'bg-orange-500',  tint: 'bg-orange-500/10',  fg: 'text-orange-600',  dot: 'bg-orange-500' },
  leafy_vegetables:  { icon: Leaf,     rail: 'bg-emerald-500', tint: 'bg-emerald-500/10', fg: 'text-emerald-600', dot: 'bg-emerald-500' },
  roots_tubers:      { icon: Carrot,   rail: 'bg-yellow-600',  tint: 'bg-yellow-600/10',  fg: 'text-yellow-700',  dot: 'bg-yellow-600' },
  other_vegetables:  { icon: Salad,    rail: 'bg-lime-500',    tint: 'bg-lime-500/10',    fg: 'text-lime-600',    dot: 'bg-lime-500' },
  fruits:            { icon: Apple,    rail: 'bg-rose-500',    tint: 'bg-rose-500/10',    fg: 'text-rose-500',    dot: 'bg-rose-500' },
  milk_products:     { icon: Milk,     rail: 'bg-sky-400',     tint: 'bg-sky-400/10',     fg: 'text-sky-500',     dot: 'bg-sky-400' },
  meat:              { icon: Beef,     rail: 'bg-red-500',     tint: 'bg-red-500/10',     fg: 'text-red-500',     dot: 'bg-red-500' },
  poultry:           { icon: Drumstick,rail: 'bg-orange-400',  tint: 'bg-orange-400/10',  fg: 'text-orange-500',  dot: 'bg-orange-400' },
  fish_seafood:      { icon: Fish,     rail: 'bg-cyan-500',    tint: 'bg-cyan-500/10',    fg: 'text-cyan-600',    dot: 'bg-cyan-500' },
  eggs:              { icon: Egg,      rail: 'bg-yellow-400',  tint: 'bg-yellow-400/15',  fg: 'text-yellow-600',  dot: 'bg-yellow-400' },
  fats_oils:         { icon: Droplets, rail: 'bg-yellow-300',  tint: 'bg-yellow-300/20',  fg: 'text-yellow-600',  dot: 'bg-yellow-300' },
  sugars:            { icon: Candy,    rail: 'bg-amber-300',   tint: 'bg-amber-300/20',   fg: 'text-amber-600',   dot: 'bg-amber-300' },
  beverages:         { icon: CupSoda,  rail: 'bg-stone-500',   tint: 'bg-stone-500/10',   fg: 'text-stone-600',   dot: 'bg-stone-500' },
  condiments_spices: { icon: Flame,    rail: 'bg-red-600',     tint: 'bg-red-600/10',     fg: 'text-red-600',     dot: 'bg-red-600' },
  nuts_seeds:        { icon: Nut,      rail: 'bg-amber-700',   tint: 'bg-amber-700/10',   fg: 'text-amber-700',   dot: 'bg-amber-700' },
  cooked_dishes:     { icon: Soup,     rail: 'bg-fuchsia-500', tint: 'bg-fuchsia-500/10', fg: 'text-fuchsia-600', dot: 'bg-fuchsia-500' },
  baked_goods:       { icon: Cookie,   rail: 'bg-amber-400',   tint: 'bg-amber-400/15',   fg: 'text-amber-600',   dot: 'bg-amber-400' },
  fast_food:         { icon: Utensils, rail: 'bg-orange-600',  tint: 'bg-orange-600/10',  fg: 'text-orange-600',  dot: 'bg-orange-600' },
  misc:              { icon: Utensils, rail: 'bg-slate-400',   tint: 'bg-slate-400/10',   fg: 'text-slate-500',   dot: 'bg-slate-400' },
};

// ─── Small subcomponents ────────────────────────────────────────────

function Dot() {
  return <span className="h-1 w-1 rounded-full bg-foreground/25" />;
}

function CategoryChip({
  active, onClick, label, count, category,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  category?: FoodCategory;
}) {
  const meta = category ? CATEGORY_META[category] : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex flex-none items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] transition-colors',
        active
          ? 'border-teal-600 bg-teal-600 text-white'
          : 'border-foreground/[0.08] bg-transparent text-foreground/65 hover:border-foreground/15 hover:text-foreground',
      )}
    >
      {meta && (
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            active ? 'bg-white/90 ring-2 ring-white/35' : meta.dot,
          )}
        />
      )}
      <span className="whitespace-nowrap">{label}</span>
      <span className={cn('text-[11px] tabular-nums', active ? 'text-white/70' : 'text-foreground/35')}>
        {count}
      </span>
    </button>
  );
}

function ViewToggleButton({
  active, onClick, icon: Icon, label,
}: { active: boolean; onClick: () => void; icon: typeof LayoutGrid; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-full p-1.5 transition-colors',
        active
          ? 'bg-teal-600 text-white'
          : 'text-foreground/45 hover:text-foreground/75',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function FilterPill({
  label, value, options, onPick,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs',
          'text-foreground/85 transition-colors hover:border-foreground/15 hover:bg-foreground/[0.03]',
        )}
      >
        <span className="text-foreground/45">{label}:</span>
        <span>{value}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-30 mt-1.5 max-h-72 w-56 overflow-y-auto rounded-xl border border-foreground/[0.08] bg-popover p-1 shadow-2xl">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onPick(opt.value); setOpen(false); }}
                className={cn(
                  'block w-full rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-foreground/[0.05]',
                  opt.value === value && 'bg-teal-600/10 text-teal-700 dark:text-teal-300',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
