import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Loader2, ChefHat, Plus, ChevronRight, Users, Flame, Upload } from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { recipesApi, type RecipeListItem } from '@/modules/workspace/api/recipes';
import { cn } from '@/lib/utils';
import { RecipeImportDialog } from './RecipeImportDialog';

/**
 * RecipeList — read-only list of recipes for the workspace.
 *
 * Live nutrition is NOT computed here (expensive). Show counts only.
 * Each row links to the detail view, which is where nutrition gets computed.
 */
interface RecipeListProps {
  detailHrefBase: string;
  newHref: string;
  heroEyebrow: string;
}

export function RecipeList({ detailHrefBase, newHref, heroEyebrow }: RecipeListProps) {
  const [query, setQuery] = useState('');
  const [includeDrafts, setIncludeDrafts] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

  const listQ = useQuery({
    queryKey: ['recipes', 'list', query, includeDrafts],
    queryFn: () => recipesApi.list({
      search: query.trim() || undefined,
      includeDrafts,
    }),
    retry: 1,
    staleTime: 15_000,
  });

  const recipes = listQ.data ?? [];

  return (
    <motion.div
      variants={stagger(0.06, 0.05)}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[11px] uppercase tracking-[0.22em] text-foreground/45">
            {heroEyebrow}
          </span>
          <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">Recipes</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/60">
            Recipes built from the food library. Nutrition is recomputed live from each ingredient — when source data updates, your recipes do too.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.08] px-4 py-2 text-xs font-medium text-foreground/85 transition-colors hover:border-foreground/15 hover:bg-foreground/[0.03]"
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </button>
          <Link
            to={newHref}
            className="inline-flex items-center gap-1.5 rounded-full bg-violet-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-600"
          >
            <Plus className="h-3.5 w-3.5" />
            New recipe
          </Link>
        </div>
      </motion.div>

      {importOpen && <RecipeImportDialog onClose={() => setImportOpen(false)} />}

      {/* Search + filters */}
      <motion.div variants={fadeUp} className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes…"
            className="w-full rounded-xl border border-foreground/[0.08] bg-transparent px-10 py-2.5 text-sm placeholder:text-foreground/35 focus:border-violet-500/40 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-foreground/55">
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={includeDrafts}
              onChange={(e) => setIncludeDrafts(e.target.checked)}
              className="h-3 w-3 cursor-pointer accent-violet-500"
            />
            Show drafts
          </label>
          <span className="ml-auto tabular-nums text-foreground/40">
            {recipes.length.toLocaleString()} recipes
          </span>
        </div>
      </motion.div>

      {/* Content */}
      <motion.div variants={fadeUp}>
        {listQ.isLoading ? (
          <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </Glass>
        ) : recipes.length === 0 ? (
          <EmptyState newHref={newHref} hasQuery={query.length > 0} />
        ) : (
          <RecipeTable recipes={recipes} hrefBase={detailHrefBase} />
        )}
      </motion.div>
    </motion.div>
  );
}

function EmptyState({ newHref, hasQuery }: { newHref: string; hasQuery: boolean }) {
  return (
    <Glass className="flex flex-col items-center gap-3 p-12 text-center">
      <ChefHat className="h-8 w-8 text-foreground/30" />
      <div className="text-sm text-foreground/60">
        {hasQuery ? 'No recipes match your search.' : 'No recipes yet.'}
      </div>
      {!hasQuery && (
        <Link
          to={newHref}
          className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-violet-500 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-600"
        >
          <Plus className="h-3.5 w-3.5" />
          Create your first recipe
        </Link>
      )}
    </Glass>
  );
}

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
              <th className="px-4 py-3 text-right font-normal" title="Approximate kcal per serving — exact value on detail page">kcal / serving</th>
              <th className="px-4 py-3 text-left font-normal">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {recipes.map((r) => (
              <tr
                key={r.id}
                className="border-b border-foreground/[0.04] last:border-0 transition-colors hover:bg-foreground/[0.025]"
              >
                <td className="px-4 py-3">
                  <Link to={`${hrefBase}/${r.id}`} className="group block">
                    <div className="text-sm font-medium text-foreground group-hover:text-violet-500">
                      {r.name}
                    </div>
                    {r.description && (
                      <div className="mt-0.5 truncate text-[11px] text-foreground/50">
                        {r.description}
                      </div>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-foreground/65">
                  {r.category ?? <span className="text-foreground/35">—</span>}
                </td>
                <td className="px-4 py-3 text-center text-xs tabular-nums text-foreground/70">
                  {r.ingredient_count}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 text-xs tabular-nums text-foreground/70">
                    <Users className="h-3 w-3 text-foreground/40" />
                    {r.servings}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {r.kcal_per_serving_estimate == null ? (
                    <span className="text-foreground/35">—</span>
                  ) : (
                    <span className="inline-flex items-center justify-end gap-1 text-sm tabular-nums text-foreground">
                      <Flame className="h-3 w-3 text-foreground/40" />
                      {Math.round(r.kcal_per_serving_estimate)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em]',
                      r.is_published ? 'text-emerald-500' : 'text-foreground/40',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', r.is_published ? 'bg-emerald-500' : 'bg-foreground/30')} />
                    {r.is_published ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`${hrefBase}/${r.id}`}
                    className="inline-flex items-center text-foreground/35 hover:text-violet-500"
                  >
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
