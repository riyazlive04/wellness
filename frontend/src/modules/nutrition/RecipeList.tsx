import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Search, Loader2, ChefHat, Plus, ChevronRight, Users, Flame, Upload, LayoutGrid, List, CheckCheck,
  Utensils, Soup, Salad, Cookie, CupSoda, Coffee, Sandwich, Croissant, IceCreamCone,
  Wheat, Drumstick, GlassWater,
} from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { recipesApi, type RecipeListItem } from '@/modules/workspace/api/recipes';
import { optimistic } from '@/lib/optimistic';
import { cn } from '@/lib/utils';
import { RecipeImportDialog } from './RecipeImportDialog';

/**
 * RecipeList — workspace recipes as a "clinical-calm" card grid (deep-teal).
 *
 * Live nutrition is NOT computed here (expensive) — the SQL kcal estimate and
 * counts only. Each card links to the detail view where nutrition is computed.
 * Two views: grid (cookbook cards) and list (compact table), like Food library.
 */
interface RecipeListProps {
  detailHrefBase: string;
  newHref: string;
  heroEyebrow: string;
}

type ViewMode = 'grid' | 'list';

export function RecipeList({ detailHrefBase, newHref, heroEyebrow }: RecipeListProps) {
  const [query, setQuery] = useState('');
  const [includeDrafts, setIncludeDrafts] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [view, setView] = useState<ViewMode>('grid');
  const [category, setCategory] = useState<string | 'all'>('all');

  const listQ = useQuery({
    queryKey: ['recipes', 'list', query, includeDrafts],
    queryFn: () => recipesApi.list({ search: query.trim() || undefined, includeDrafts }),
    retry: 1,
    staleTime: 15_000,
  });

  const recipes = useMemo(() => listQ.data ?? [], [listQ.data]);

  // Per-category counts for the rail (over the current search/draft result set).
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recipes) {
      const key = (r.category ?? 'other').toLowerCase();
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [recipes]);
  const railCategories = useMemo(
    () => [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k),
    [counts],
  );

  const filtered = useMemo(
    () => (category === 'all' ? recipes : recipes.filter((r) => (r.category ?? 'other').toLowerCase() === category)),
    [recipes, category],
  );

  const publishedCount = useMemo(() => recipes.filter((r) => r.is_published).length, [recipes]);
  const draftCount = recipes.length - publishedCount;

  const queryClient = useQueryClient();
  const publishAllMut = useMutation({
    mutationFn: () => recipesApi.bulkPublish({ publish: true }),
    // Optimistic: every draft card flips to Published at once; reconcile on settle.
    ...optimistic<RecipeListItem[], void>(
      queryClient,
      ['recipes', 'list', query, includeDrafts],
      (old) => old.map((r) => ({ ...r, is_published: true })),
      { errorMessage: 'Could not publish recipes.', also: [['recipes']] },
    ),
    onSuccess: (res) => {
      toast.success(res.updated > 0 ? `Published ${res.updated} recipe${res.updated === 1 ? '' : 's'}.` : 'No drafts to publish.');
    },
  });

  return (
    <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-5">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[hsl(var(--brand-blue))] text-xs font-bold uppercase tracking-[0.18em]">{heroEyebrow}</span>
          <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight md:text-4xl">Recipes</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/60">
            Recipes built from the food library. Nutrition is recomputed live from each ingredient - when source data updates, your recipes do too.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {draftCount > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Publish all ${draftCount} draft${draftCount === 1 ? '' : 's'}? They become visible to clients immediately - including any without ingredients (which will show no nutrition until you fill them in).`)) {
                  publishAllMut.mutate();
                }
              }}
              disabled={publishAllMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/60 bg-teal-100 px-4 py-2 text-xs font-bold text-teal-700 shadow-sm transition-colors hover:bg-teal-200/70 disabled:opacity-50 dark:border-teal-500/20 dark:bg-teal-500/[0.14] dark:text-teal-300"
            >
              {publishAllMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />} Publish all ({draftCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.06] bg-card px-4 py-2 text-xs font-bold text-foreground/85 shadow-sm transition-colors hover:border-[hsl(var(--brand-blue))]/25 hover:bg-[hsl(var(--brand-blue))]/[0.04]"
          >
            <Upload className="h-3.5 w-3.5" /> Import
          </button>
          <Link
            to={newHref}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-xs font-bold text-white shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98] cta-glow"
          >
            <Plus className="h-3.5 w-3.5" /> New recipe
          </Link>
        </div>
      </motion.div>

      {importOpen && <RecipeImportDialog onClose={() => setImportOpen(false)} />}

      {/* Summary strip */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground/55">
        <span><CountUp value={recipes.length} className="font-semibold text-foreground" /> recipes</span>
        <Dot />
        <span><CountUp value={publishedCount} className="font-semibold text-foreground" /> published</span>
        <Dot />
        <span><CountUp value={draftCount} className="font-semibold text-foreground" /> drafts</span>
        <Dot />
        <span>built from the food library</span>
      </motion.div>

      {/* Search + controls */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes…"
            className="w-full rounded-full border border-foreground/[0.06] bg-card px-11 py-2.5 text-sm shadow-sm placeholder:text-foreground/35 focus:border-[hsl(var(--brand-blue))]/45 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand-blue))]/10"
          />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-foreground/60">
          <input
            type="checkbox"
            checked={includeDrafts}
            onChange={(e) => setIncludeDrafts(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-teal-600"
          />
          Show drafts
        </label>
        <div className="flex items-center rounded-full border border-foreground/[0.06] bg-card p-0.5 shadow-sm">
          <ViewToggleButton active={view === 'grid'} onClick={() => setView('grid')} icon={LayoutGrid} label="Grid" />
          <ViewToggleButton active={view === 'list'} onClick={() => setView('list')} icon={List} label="List" />
        </div>
      </motion.div>

      {/* Category rail */}
      {railCategories.length > 1 && (
        <motion.div variants={fadeUp}>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <CategoryChip active={category === 'all'} onClick={() => setCategory('all')} label="All" count={recipes.length} />
            {railCategories.map((c) => (
              <CategoryChip
                key={c}
                active={category === c}
                onClick={() => setCategory((prev) => (prev === c ? 'all' : c))}
                label={recipeCatMeta(c).label}
                count={counts.get(c) ?? 0}
                hex={recipeCatMeta(c).hex}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* Content */}
      <motion.div variants={fadeUp}>
        {listQ.isLoading ? (
          <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </Glass>
        ) : filtered.length === 0 ? (
          <EmptyState newHref={newHref} hasQuery={query.length > 0} />
        ) : view === 'grid' ? (
          <RecipeGrid recipes={filtered} hrefBase={detailHrefBase} newHref={newHref} showGhost={category === 'all' && !query} />
        ) : (
          <RecipeTable recipes={filtered} hrefBase={detailHrefBase} />
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Grid view — animated cookbook cards ───────────────────────────

function RecipeGrid({
  recipes, hrefBase, newHref, showGhost,
}: { recipes: RecipeListItem[]; hrefBase: string; newHref: string; showGhost: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {recipes.map((r, i) => (
        <RecipeCard key={r.id} r={r} index={i} href={`${hrefBase}/${r.id}`} />
      ))}
      {showGhost && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: Math.min(recipes.length, 12) * 0.04, ease: [0.2, 0.7, 0.3, 1] }}
        >
          <Link
            to={newHref}
            className="group flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-foreground/15 text-foreground/45 transition-colors hover:border-[hsl(var(--brand-blue))]/40 hover:bg-[hsl(var(--brand-blue))]/[0.05] hover:text-[hsl(var(--brand-blue))]"
          >
            <span className="grid h-11 w-11 place-items-center rounded-2xl border border-foreground/10 bg-foreground/[0.02] transition-colors group-hover:border-[hsl(var(--brand-blue))]/30">
              <Plus className="h-5 w-5" />
            </span>
            <span className="text-sm font-bold">New recipe</span>
          </Link>
        </motion.div>
      )}
    </div>
  );
}

function RecipeCard({ r, index, href }: { r: RecipeListItem; index: number; href: string }) {
  const meta = recipeCatMeta((r.category ?? 'other').toLowerCase());
  const Icon = meta.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: Math.min(index, 12) * 0.04, ease: [0.2, 0.7, 0.3, 1] }}
    >
      <Link
        to={href}
        className={cn(
          'group relative flex h-full flex-col overflow-hidden rounded-3xl border border-foreground/[0.06] bg-card shadow-sm',
          'transition-[transform,box-shadow,border-color] duration-200',
          'hover:-translate-y-1 hover:border-[hsl(var(--brand-blue))]/30 hover:shadow-[0_18px_40px_-22px_rgba(14,26,36,0.42)]',
        )}
      >
        {/* Hover sheen */}
        <span className="pointer-events-none absolute inset-0 z-[3] -translate-x-[120%] bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.5)_50%,transparent_70%)] transition-transform duration-700 ease-out group-hover:translate-x-[120%] dark:bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.08)_50%,transparent_70%)]" />

        {/* Tinted category band */}
        <div
          className="relative grid h-[74px] place-items-center"
          style={{ background: `linear-gradient(135deg, ${meta.hex}26, ${meta.hex}0d)` }}
        >
          <span
            className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-white shadow-[0_4px_12px_-4px_rgba(14,26,36,0.25)] transition-transform duration-300 group-hover:-rotate-[6deg] group-hover:scale-[1.12] dark:bg-white/10"
            style={{ color: meta.hex }}
          >
            <Icon className="h-5 w-5" />
          </span>
          <StatusBadge published={r.is_published} />
          <span className="absolute bottom-2 left-3 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: meta.hex }}>
            {meta.label}
          </span>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="line-clamp-2 min-h-[2.4rem] text-sm font-bold leading-snug tracking-[-0.01em]">
            {r.name}
          </div>
          <div className="mt-auto flex items-center gap-3.5 border-t border-foreground/[0.06] pt-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-foreground/60" title="Ingredients">
              <Plus className="h-3.5 w-3.5 text-foreground/30" />
              <b className="font-semibold tabular-nums text-foreground">{r.ingredient_count}</b>
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-foreground/60" title="Servings">
              <Users className="h-3.5 w-3.5 text-foreground/30" />
              <b className="font-semibold tabular-nums text-foreground">{r.servings}</b>
            </span>
            <span className="ml-auto flex items-baseline gap-1">
              {r.kcal_per_serving_estimate == null ? (
                <span className="text-sm font-bold text-foreground/30">-</span>
              ) : (
                <span className="bg-gradient-to-b from-foreground to-teal-600 bg-clip-text text-base font-bold tabular-nums text-transparent">
                  {Math.round(r.kcal_per_serving_estimate)}
                </span>
              )}
              <span className="text-[9px] uppercase tracking-[0.1em] text-foreground/45">kcal</span>
            </span>
          </div>
          {(r.protein_g_per_serving != null || r.carbs_g_per_serving != null || r.fat_g_per_serving != null) && (
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium">
              {r.nutrition_estimated && (
                <span className="text-[9px] uppercase tracking-wide text-foreground/35" title="AI estimate">≈</span>
              )}
              {r.protein_g_per_serving != null && (
                <span className="rounded-full bg-sky-400/10 px-1.5 py-0.5 text-sky-700 dark:text-sky-300">P {r.protein_g_per_serving}g</span>
              )}
              {r.carbs_g_per_serving != null && (
                <span className="rounded-full bg-amber-400/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">C {r.carbs_g_per_serving}g</span>
              )}
              {r.fat_g_per_serving != null && (
                <span className="rounded-full bg-rose-400/10 px-1.5 py-0.5 text-rose-700 dark:text-rose-300">F {r.fat_g_per_serving}g</span>
              )}
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

function StatusBadge({ published }: { published: boolean }) {
  return (
    <span
      className={cn(
        'absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] shadow-sm',
        published ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/[0.16] dark:text-teal-200' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/[0.16] dark:text-amber-200',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full bg-current', published && 'animate-pulse')} />
      {published ? 'Published' : 'Draft'}
    </span>
  );
}

// ─── List view — compact table (teal) ─────────────────────────────

function RecipeTable({ recipes, hrefBase }: { recipes: RecipeListItem[]; hrefBase: string }) {
  return (
    <Glass className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-foreground/[0.06] text-[10px] uppercase tracking-[0.18em] text-foreground/45">
            <tr>
              <th className="px-4 py-3 text-left font-normal">Recipe</th>
              <th className="px-4 py-3 text-left font-normal">Category</th>
              <th className="px-4 py-3 text-center font-normal">Ingredients</th>
              <th className="px-4 py-3 text-center font-normal">Servings</th>
              <th className="px-4 py-3 text-right font-normal" title="Approximate kcal per serving - exact value on detail page">kcal / serving</th>
              <th className="px-4 py-3 text-left font-normal">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {recipes.map((r) => (
              <tr key={r.id} className="border-b border-foreground/[0.04] transition-colors last:border-0 hover:bg-foreground/[0.025]">
                <td className="px-4 py-3">
                  <Link to={`${hrefBase}/${r.id}`} className="group block">
                    <div className="text-sm font-medium text-foreground group-hover:text-teal-600">{r.name}</div>
                    {r.description && <div className="mt-0.5 truncate text-[11px] text-foreground/50">{r.description}</div>}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs capitalize text-foreground/65">
                  {r.category ?? <span className="text-foreground/35">-</span>}
                </td>
                <td className="px-4 py-3 text-center text-xs tabular-nums text-foreground/70">{r.ingredient_count}</td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 text-xs tabular-nums text-foreground/70">
                    <Users className="h-3 w-3 text-foreground/40" />{r.servings}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {r.kcal_per_serving_estimate == null ? (
                    <span className="text-foreground/35">-</span>
                  ) : (
                    <span className="inline-flex items-center justify-end gap-1 text-sm tabular-nums text-foreground">
                      <Flame className="h-3 w-3 text-foreground/40" />{Math.round(r.kcal_per_serving_estimate)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={cn(
                    'inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em]',
                    r.is_published ? 'text-teal-600' : 'text-amber-600/80',
                  )}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', r.is_published ? 'bg-teal-600' : 'bg-amber-500/70')} />
                    {r.is_published ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link to={`${hrefBase}/${r.id}`} className="inline-flex items-center text-foreground/35 hover:text-teal-600">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Glass>
  );
}

function EmptyState({ newHref, hasQuery }: { newHref: string; hasQuery: boolean }) {
  return (
    <Glass className="flex flex-col items-center gap-3 p-12 text-center">
      <ChefHat className="h-8 w-8 text-foreground/30" />
      <div className="text-sm text-foreground/60">{hasQuery ? 'No recipes match your search.' : 'No recipes yet.'}</div>
      {!hasQuery && (
        <Link
          to={newHref}
          className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-xs font-bold text-white shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98] cta-glow"
        >
          <Plus className="h-3.5 w-3.5" /> Create your first recipe
        </Link>
      )}
    </Glass>
  );
}

// ─── Category metadata — icon + colour per recipe category ──────────

interface RecipeCatMeta { label: string; hex: string; icon: ComponentType<{ className?: string }> }

const RECIPE_CAT: Record<string, RecipeCatMeta> = {
  main:      { label: 'Main',      hex: '#D6453C', icon: Utensils },
  lunch:     { label: 'Lunch',     hex: '#D6453C', icon: Utensils },
  dinner:    { label: 'Dinner',    hex: '#9333EA', icon: Utensils },
  breakfast: { label: 'Breakfast', hex: '#D9A40A', icon: Coffee },
  beverage:  { label: 'Beverage',  hex: '#0CA5B8', icon: CupSoda },
  drink:     { label: 'Drink',     hex: '#0CA5B8', icon: GlassWater },
  juice:     { label: 'Juice',     hex: '#0CA5B8', icon: CupSoda },
  smoothie:  { label: 'Smoothie',  hex: '#0CA5B8', icon: CupSoda },
  dessert:   { label: 'Dessert',   hex: '#E0457B', icon: IceCreamCone },
  sweet:     { label: 'Sweet',     hex: '#E0457B', icon: Cookie },
  snack:     { label: 'Snack',     hex: '#EA8A2F', icon: Cookie },
  side:      { label: 'Side',      hex: '#10A36A', icon: Salad },
  salad:     { label: 'Salad',     hex: '#10A36A', icon: Salad },
  soup:      { label: 'Soup',      hex: '#C2820B', icon: Soup },
  curry:     { label: 'Curry',     hex: '#D97706', icon: Soup },
  bread:     { label: 'Bread',     hex: '#9A6B2F', icon: Wheat },
  baked:     { label: 'Baked',     hex: '#9A6B2F', icon: Croissant },
  sandwich:  { label: 'Sandwich',  hex: '#C2820B', icon: Sandwich },
  meat:      { label: 'Meat',      hex: '#D6453C', icon: Drumstick },
  other:     { label: 'Other',     hex: '#0F766E', icon: ChefHat },
};

function recipeCatMeta(category: string): RecipeCatMeta {
  return RECIPE_CAT[category] ?? { label: titleCase(category), hex: '#0F766E', icon: ChefHat };
}
function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Other';
}

// ─── Small subcomponents ────────────────────────────────────────────

function Dot() {
  return <span className="h-1 w-1 rounded-full bg-foreground/25" />;
}

function CategoryChip({
  active, onClick, label, count, hex,
}: { active: boolean; onClick: () => void; label: string; count: number; hex?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex flex-none items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-semibold capitalize transition-colors',
        active
          ? 'border-transparent bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-sm'
          : 'border-foreground/[0.06] bg-card text-foreground/65 shadow-sm hover:border-[hsl(var(--brand-blue))]/25 hover:text-foreground',
      )}
    >
      {hex && (
        <span
          className={cn('h-2 w-2 rounded-full', active && 'ring-2 ring-white/35')}
          style={{ background: active ? 'rgba(255,255,255,0.9)' : hex }}
        />
      )}
      <span className="whitespace-nowrap">{label}</span>
      <span className={cn('text-[11px] tabular-nums', active ? 'text-white/70' : 'text-foreground/35')}>{count}</span>
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
        active ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-sm' : 'text-foreground/45 hover:text-foreground/75',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

/** Small count-up number for the summary strip. */
function CountUp({ value, className }: { value: number; className?: string }) {
  const display = useCountUp(value);
  return <b className={cn('tabular-nums', className)}>{display.toLocaleString()}</b>;
}

function useCountUp(target: number, durationMs = 650): number {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    let raf = 0;
    let startTs: number | null = null;
    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;
      const p = Math.min(1, (ts - startTs) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return val;
}
