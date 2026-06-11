import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Loader2, BookOpen, Filter } from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import {
  nutritionApi,
  CATEGORY_LABEL,
  CATEGORY_LIST,
  type FoodSearchHit,
  type FoodCategory,
  type FoodSource,
} from '@/modules/workspace/api/nutrition';
import { cn } from '@/lib/utils';

/**
 * FoodLibrary — shared component for browsing the 515-food IFCT 2017
 * nutrition master. Used in three places:
 *   - Nutritionist  → /dashboard/nutrition/foods
 *   - Client        → /portal/foods (read-only lookup)
 *   - Super admin   → /admin/nutrition/foods
 *
 * `detailHref` controls where clicking a row navigates (per-role route),
 * and `accent` adjusts the title labelling for context.
 */
interface FoodLibraryProps {
  /** Where clicking a row should navigate. The food id is appended. */
  detailHrefBase: string;
  /** Hero label tier for context. */
  heroEyebrow: string;
}

export function FoodLibrary({ detailHrefBase, heroEyebrow }: FoodLibraryProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FoodCategory | 'all'>('all');
  const [source, setSource] = useState<FoodSource | 'all'>('all');

  // We start with empty `q` to surface the broad list, then debounce-search.
  const searchQ = useQuery({
    queryKey: ['nutrition', 'foods', 'search', query, category],
    queryFn: () => nutritionApi.searchFoods({
      q: query.trim() || ' ', // backend requires non-empty; space matches everything via trigram
      category: category === 'all' ? undefined : category,
      limit: 200,
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
      className="space-y-5"
    >
      {/* Header */}
      <motion.div variants={fadeUp}>
        <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">
          {heroEyebrow}
        </span>
        <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Food library.</h1>
        <p className="mt-2 max-w-2xl text-sm text-foreground/65">
          Every nutrient value below is sourced from <strong>IFCT 2017</strong> (NIN / ICMR) or
          USDA FoodData Central. Click any food for the full panel and provenance trail.
        </p>
      </motion.div>

      {/* Search + filters */}
      <motion.div variants={fadeUp} className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by food name or alias…"
            className="w-full rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] px-10 py-3 text-sm focus:border-violet-400/60 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Filter className="h-3 w-3 text-foreground/55" />
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
              { label: 'All sources', value: 'all' },
              { label: 'IFCT 2017',   value: 'IFCT-2017' },
              { label: 'USDA FDC',    value: 'USDA-FDC' },
              { label: 'Custom approved', value: 'CUSTOM-APPROVED' },
            ]}
            onPick={(v) => setSource(v as FoodSource | 'all')}
          />
          <span className="ml-auto text-[11px] text-foreground/45 tabular-nums">
            {filtered.length} of {hits.length} foods
          </span>
        </div>
      </motion.div>

      {/* List */}
      <motion.div variants={fadeUp}>
        {searchQ.isLoading ? (
          <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </Glass>
        ) : filtered.length === 0 ? (
          <Glass className="flex flex-col items-center gap-2 p-10 text-center">
            <BookOpen className="h-6 w-6 text-foreground/35" />
            <div className="text-sm text-foreground/65">
              {query ? `No foods match "${query}".` : 'No foods found.'}
            </div>
          </Glass>
        ) : (
          <Glass className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-foreground/[0.06] bg-foreground/[0.02] text-[10px] uppercase tracking-[0.16em] text-foreground/55">
                  <tr>
                    <th className="px-4 py-2 text-left">Code</th>
                    <th className="px-4 py-2 text-left">Food</th>
                    <th className="px-4 py-2 text-left">Category</th>
                    <th className="px-4 py-2 text-right">kcal</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((h) => (
                    <FoodRow key={h.food.id} hit={h} href={`${detailHrefBase}/${h.food.id}`} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-foreground/[0.06] bg-foreground/[0.02] px-4 py-2 text-[11px] text-foreground/55">
              Per 100g edible portion · Click any row for full nutrient panel
            </div>
          </Glass>
        )}
      </motion.div>
    </motion.div>
  );
}

function FoodRow({ hit, href }: { hit: FoodSearchHit; href: string }) {
  // We don't have kcal in the list payload yet — we'd need a second fetch.
  // For now show "—" and the row loads the panel on click. (Phase next:
  // extend the /foods/search response to inline summary kcal.)
  return (
    <tr className="border-b border-foreground/[0.04] last:border-0 transition-colors hover:bg-foreground/[0.03]">
      <td className="px-4 py-2 text-[11px] text-foreground/55 tabular-nums">
        {hit.food.source_id ?? '—'}
      </td>
      <td className="px-4 py-2">
        <Link to={href} className="text-sm font-medium text-foreground hover:text-violet-600 dark:hover:text-violet-300">
          {hit.food.canonical_name}
        </Link>
        <div className="mt-0.5 text-[10px] text-foreground/45">
          {hit.food.source} {hit.food.measurement_state !== 'as_consumed' && `· ${hit.food.measurement_state}`}
        </div>
      </td>
      <td className="px-4 py-2 text-xs text-foreground/65">
        {CATEGORY_LABEL[hit.food.category]}
      </td>
      <td className="px-4 py-2 text-right">
        <Link to={href} className="text-xs text-violet-600 hover:underline dark:text-violet-300">
          View →
        </Link>
      </td>
    </tr>
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
          'inline-flex items-center gap-1.5 rounded-full border border-foreground/15 px-3 py-1 text-xs',
          'text-foreground/85 transition-colors hover:bg-foreground/[0.04]',
        )}
      >
        <span className="text-foreground/55">{label}:</span> {value}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-xl border border-foreground/[0.08] bg-popover p-1 shadow-2xl">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onPick(opt.value); setOpen(false); }}
                className={cn(
                  'block w-full rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-foreground/[0.05]',
                  opt.value === value && 'bg-violet-500/15 text-violet-700 dark:text-violet-200',
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
