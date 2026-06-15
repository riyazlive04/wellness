import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Loader2, BookOpen, Filter, LayoutGrid, List, ChevronRight, Download } from 'lucide-react';
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
} from '@/modules/workspace/api/nutrition';
import { cn } from '@/lib/utils';

/**
 * FoodLibrary — refined, clinical aesthetic.
 *
 * Design ethos:
 *   - One accent (violet) used sparingly.
 *   - Hairline borders, generous whitespace, typography-led hierarchy.
 *   - Category surfaces as a single colored vertical accent + small label
 *     rather than full-bleed art. Lets dense lists stay scannable.
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

  const searchQ = useQuery({
    queryKey: ['nutrition', 'foods', 'search', query, category],
    queryFn: () => nutritionApi.searchFoods({
      q: query.trim(),
      category: category === 'all' ? undefined : category,
      limit: 500,
    }),
    retry: 1,
    staleTime: 30_000,
  });

  const hits = searchQ.data ?? [];
  const filtered = useMemo(() => {
    if (source === 'all') return hits;
    return hits.filter((h) => h.food.source === source);
  }, [hits, source]);

  return (
    <motion.div
      variants={stagger(0.06, 0.05)}
      initial="initial"
      animate="animate"
      className="space-y-6"
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

      {/* Search + filters + view toggle */}
      <motion.div variants={fadeUp} className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or alias…"
            className="w-full rounded-xl border border-foreground/[0.08] bg-transparent px-10 py-2.5 text-sm placeholder:text-foreground/35 focus:border-violet-500/40 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-3 w-3 text-foreground/40" />
          <FilterPill
            label="Category"
            value={category === 'all' ? 'All' : CATEGORY_LABEL[category]}
            options={[{ label: 'All', value: 'all' }, ...CATEGORY_LIST.map((c) => ({ label: CATEGORY_LABEL[c], value: c }))]}
            onPick={(v) => setCategory(v as FoodCategory | 'all')}
          />
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
          <span className="ml-auto flex items-center gap-3">
            <span className="text-[11px] tabular-nums text-foreground/40">
              {filtered.length.toLocaleString()} of {hits.length.toLocaleString()}
            </span>
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
                'inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.08] px-3 py-1 text-xs',
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
          </span>
        </div>
      </motion.div>

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
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {foods.map((h) => (
        <FoodCard
          key={h.food.id}
          food={h.food}
          kcal={h.energy_kcal_per_100g}
          href={`${hrefBase}/${h.food.id}`}
        />
      ))}
    </div>
  );
}

function FoodCard({ food, kcal, href }: { food: FoodSummary; kcal: number | null; href: string }) {
  const accent = CATEGORY_ACCENT[food.category];
  return (
    <Link
      to={href}
      className={cn(
        'group relative flex flex-col gap-3 rounded-xl border border-foreground/[0.07] bg-foreground/[0.015] p-4',
        'transition-colors hover:border-violet-500/30 hover:bg-foreground/[0.03]',
      )}
    >
      {/* Top row: category dot + code */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', accent)} />
          <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
            {CATEGORY_LABEL[food.category]}
          </span>
        </div>
        {food.source_id && (
          <span className="font-mono text-[10px] tabular-nums text-foreground/40">
            {food.source_id}
          </span>
        )}
      </div>

      {/* Food name */}
      <div className="min-h-[2.5rem]">
        <div className="text-sm font-medium leading-snug text-foreground line-clamp-2">
          {food.canonical_name}
        </div>
      </div>

      {/* Calorie line — quiet but always present */}
      <div className="flex items-baseline gap-1 text-foreground/80">
        <span className="text-lg font-medium tabular-nums">
          {kcal == null ? '—' : Math.round(kcal)}
        </span>
        <span className="text-[10px] uppercase tracking-[0.16em] text-foreground/45">
          kcal · 100g
        </span>
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between border-t border-foreground/[0.05] pt-2.5 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
        <span>
          {food.source}
          {food.measurement_state !== 'as_consumed' && (
            <span className="ml-1.5 text-foreground/35">· {food.measurement_state}</span>
          )}
        </span>
        <ChevronRight className="h-3 w-3 text-foreground/30 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-500" />
      </div>
    </Link>
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
  const accent = CATEGORY_ACCENT[food.category];
  return (
    <tr className="border-b border-foreground/[0.04] last:border-0 transition-colors hover:bg-foreground/[0.025]">
      <td className="px-4 py-2.5 font-mono text-[11px] tabular-nums text-foreground/55">
        {food.source_id ?? '—'}
      </td>
      <td className="px-4 py-2.5">
        <Link to={href} className="flex items-center gap-2.5 group">
          <span className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-full', accent)} />
          <div className="min-w-0">
            <div className="truncate text-sm text-foreground group-hover:text-violet-500">
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
        <Link to={href} className="inline-flex items-center text-foreground/35 hover:text-violet-500">
          <ChevronRight className="h-4 w-4" />
        </Link>
      </td>
    </tr>
  );
}

// ─── Category accent colors ───────────────────────────────────────
// Single Tailwind class per category — a small color dot acts as the only
// chromatic signal, keeping the cards calm and scannable.

const CATEGORY_ACCENT: Record<FoodCategory, string> = {
  cereals:           'bg-amber-500',
  pulses:            'bg-orange-500',
  leafy_vegetables:  'bg-emerald-500',
  roots_tubers:      'bg-yellow-600',
  other_vegetables:  'bg-lime-500',
  fruits:            'bg-rose-500',
  milk_products:     'bg-sky-400',
  meat:              'bg-red-500',
  poultry:           'bg-orange-400',
  fish_seafood:      'bg-cyan-500',
  eggs:              'bg-yellow-400',
  fats_oils:         'bg-yellow-300',
  sugars:            'bg-amber-300',
  beverages:         'bg-stone-500',
  condiments_spices: 'bg-red-600',
  nuts_seeds:        'bg-amber-700',
  cooked_dishes:     'bg-fuchsia-500',
  baked_goods:       'bg-amber-400',
  fast_food:         'bg-orange-600',
  misc:              'bg-slate-400',
};

// ─── Small subcomponents ────────────────────────────────────────────

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
          ? 'bg-foreground/[0.08] text-foreground'
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
          'inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.08] px-3 py-1 text-xs',
          'text-foreground/85 transition-colors hover:border-foreground/15 hover:bg-foreground/[0.03]',
        )}
      >
        <span className="text-foreground/45">{label}:</span>
        <span>{value}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1.5 max-h-72 w-56 overflow-y-auto rounded-xl border border-foreground/[0.08] bg-popover p-1 shadow-2xl">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onPick(opt.value); setOpen(false); }}
                className={cn(
                  'block w-full rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-foreground/[0.05]',
                  opt.value === value && 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
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
