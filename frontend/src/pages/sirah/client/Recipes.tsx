import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BookOpen, Loader2, Search, Play, ArrowLeft, Flame, Users, ChefHat } from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type RecipeListItem } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Recipe library — read-only on the client side. The nutritionist UI
 * manages CRUD. Clients browse the list, click into a recipe, see
 * ingredients + instructions + (when available) a YouTube/Vimeo embed.
 */
export default function ClientRecipes() {
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const [q, setQ] = useState('');
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const cuisinesQ = useQuery({
    queryKey: ['me', 'recipes-cuisines'],
    queryFn: () => clientsApi.listCuisines(),
    retry: 1,
    staleTime: 60 * 60 * 1000,
  });
  const recipesQ = useQuery({
    queryKey: ['me', 'recipes', q, cuisine],
    queryFn: () => clientsApi.listRecipes({
      q: q.trim() || undefined,
      cuisine: cuisine ?? undefined,
      limit: 50,
    }),
    retry: 1,
  });

  const recipes = recipesQ.data ?? [];

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">

        {selectedId ? (
          <RecipeDetailView id={selectedId} onBack={() => setSelectedId(null)} />
        ) : (
          <>
            <motion.div variants={fadeUp}>
              <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Eat well · Recipes</span>
              <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Recipes from your nutritionist.</h1>
              <p className="mt-2 max-w-2xl text-sm text-foreground/65">
                A curated library of plates tuned to your plan. Tap any recipe for ingredients, instructions, and the technique video when it's there.
              </p>
            </motion.div>

            <motion.div variants={fadeUp} className="mt-6">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search recipes…"
                  className="w-full rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] px-10 py-3 text-sm focus:border-teal-400/60 focus:outline-none"
                />
              </div>
              {(cuisinesQ.data?.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCuisine(null)}
                    className={cn(
                      'rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
                      cuisine === null
                        ? 'bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.40)] to-[hsl(var(--brand-magenta)_/_0.30)] text-foreground'
                        : 'border border-foreground/10 text-foreground/65 hover:bg-foreground/[0.04]',
                    )}
                  >
                    All cuisines
                  </button>
                  {(cuisinesQ.data ?? []).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCuisine(cuisine === c ? null : c)}
                      className={cn(
                        'rounded-full px-3 py-1 text-[11px] font-medium transition-colors capitalize',
                        cuisine === c
                          ? 'bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.40)] to-[hsl(var(--brand-magenta)_/_0.30)] text-foreground'
                          : 'border border-foreground/10 text-foreground/65 hover:bg-foreground/[0.04]',
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>

            {recipesQ.isLoading ? (
              <motion.div variants={fadeUp}>
                <Glass className="mt-6 flex items-center justify-center p-10 text-sm text-foreground/55">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
                </Glass>
              </motion.div>
            ) : recipes.length === 0 ? (
              <motion.div variants={fadeUp}>
                <Glass className="mt-6 flex flex-col items-center gap-3 p-10 text-center">
                  <BookOpen className="h-7 w-7 text-foreground/35" />
                  <div className="text-sm text-foreground/65">
                    {q ? `No recipes match "${q}".` : 'No recipes published yet.'}
                  </div>
                </Glass>
              </motion.div>
            ) : (
              <motion.div variants={fadeUp} className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recipes.map((r) => (
                  <RecipeTile key={r.id} recipe={r} onClick={() => setSelectedId(r.id)} />
                ))}
              </motion.div>
            )}
          </>
        )}
      </motion.div>
    </ClientLayout>
  );
}

const CARD_GRADIENTS = [
  'from-teal-400/25 to-emerald-400/15',
  'from-sky-400/25 to-blue-400/15',
  'from-amber-400/25 to-orange-400/15',
  'from-rose-400/25 to-pink-400/15',
  'from-violet-400/25 to-fuchsia-400/15',
  'from-cyan-400/25 to-teal-400/15',
];
function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return CARD_GRADIENTS[Math.abs(h) % CARD_GRADIENTS.length];
}

function RecipeTile({ recipe, onClick }: { recipe: RecipeListItem; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-2xl border border-foreground/[0.06] bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      {/* Cookbook banner - gradient + chef-hat, since recipes have no photo yet */}
      <div className={cn('relative flex h-24 items-center justify-center bg-gradient-to-br', gradientFor(recipe.id))}>
        <ChefHat className="h-8 w-8 text-foreground/25 transition-transform duration-300 group-hover:scale-110" />
        {recipe.category && (
          <span className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-foreground/70 backdrop-blur-sm">
            {recipe.category}
          </span>
        )}
        {recipe.video_url && (
          <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-background/85 backdrop-blur-sm">
            <Play className="h-3 w-3 text-teal-600 dark:text-teal-300" />
          </span>
        )}
      </div>
      {/* Body */}
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <div className="line-clamp-2 text-sm font-bold leading-tight transition-colors group-hover:text-teal-600 dark:group-hover:text-teal-300">
          {recipe.name}
        </div>
        {recipe.description && (
          <div className="line-clamp-2 text-[11px] text-foreground/60">{recipe.description}</div>
        )}
        <div className="mt-auto flex items-center gap-3 pt-1.5 text-[11px] text-foreground/55">
          {recipe.total_kcal != null ? (
            <span className="inline-flex items-center gap-1"><Flame className="h-3 w-3" /> {recipe.total_kcal} kcal</span>
          ) : (
            <span className="text-foreground/35">No nutrition yet</span>
          )}
          <span className="ml-auto inline-flex items-center gap-1"><Users className="h-3 w-3" /> {recipe.servings}</span>
        </div>
      </div>
    </button>
  );
}

function RecipeDetailView({ id, onBack }: { id: string; onBack: () => void }) {
  const detailQ = useQuery({
    queryKey: ['me', 'recipe', id],
    queryFn: () => clientsApi.getRecipe(id),
    retry: 1,
  });

  if (detailQ.isLoading) {
    return (
      <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading recipe…
      </Glass>
    );
  }
  if (detailQ.isError || !detailQ.data) {
    return (
      <Glass className="p-6 text-sm text-foreground/65">Couldn't load that recipe.</Glass>
    );
  }
  const r = detailQ.data;
  const embed = r.video_url ? toEmbedUrl(r.video_url) : null;

  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate" className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs text-foreground/65 hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to recipes
      </button>

      <div>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{r.name}</h1>
        {r.description && <p className="mt-2 text-sm text-foreground/75">{r.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-foreground/65">
          {r.total_kcal != null && <span className="inline-flex items-center gap-1"><Flame className="h-3 w-3" /> {r.total_kcal} kcal</span>}
          <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {r.servings} servings</span>
        </div>
      </div>

      {embed && (
        <Glass className="overflow-hidden p-0">
          <div className="aspect-video w-full">
            <iframe
              src={embed}
              title={r.name}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        </Glass>
      )}

      <div className="grid gap-5 md:grid-cols-[1fr_2fr]">
        <Glass className="p-5">
          <h2 className="text-sm font-semibold">Ingredients</h2>
          {r.ingredients.length === 0 ? (
            <p className="mt-3 text-xs text-foreground/55">No ingredients listed.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {r.ingredients.map((i) => (
                <li key={i.id} className="flex items-baseline justify-between gap-3 border-b border-foreground/[0.06] pb-1.5 last:border-0 last:pb-0">
                  <span className="text-foreground/85">{i.name}</span>
                  <span className="text-xs text-foreground/65 tabular-nums">{i.quantity} {i.unit}</span>
                </li>
              ))}
            </ul>
          )}
        </Glass>

        <Glass className="p-5">
          <h2 className="text-sm font-semibold">Instructions</h2>
          {r.instructions ? (
            <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
              {r.instructions}
            </div>
          ) : (
            <p className="mt-3 text-xs text-foreground/55">No instructions yet.</p>
          )}
        </Glass>
      </div>
    </motion.div>
  );
}

/**
 * Convert a YouTube/Vimeo watch URL to an embed URL. Returns null for any
 * URL we can't safely embed (we don't want to render raw third-party iframes).
 */
function toEmbedUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    // YouTube
    if (/(^|\.)youtube\.com$/.test(u.hostname)) {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
      // youtube.com/embed/<id> already
      if (u.pathname.startsWith('/embed/')) return u.toString();
    }
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '');
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    // Vimeo
    if (/(^|\.)vimeo\.com$/.test(u.hostname)) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}