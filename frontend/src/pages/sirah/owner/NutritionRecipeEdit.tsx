import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { Glass } from '@/design-system';
import { RecipeBuilder } from '@/modules/nutrition/RecipeBuilder';
import { recipesApi } from '@/modules/workspace/api/recipes';

/**
 * Edit-mode wrapper. We need to fetch the recipe first so we can hydrate the
 * RecipeBuilder with existing state. Once loaded, RecipeBuilder takes over.
 */
export default function OwnerNutritionRecipeEdit() {
  const { id } = useParams<{ id: string }>();
  const ws = readWorkspaceSummary();
  const recipeQ = useQuery({
    queryKey: ['recipes', 'detail', id],
    queryFn: () => recipesApi.get(id as string),
    enabled: !!id,
    retry: 1,
  });

  return (
    <OwnerLayout
      practiceName={ws.practiceName}
      ownerName={ws.ownerName}
      initials={ws.initials}
      trialDaysLeft={28}
      topbarContext="Nutrition · Edit recipe"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        {recipeQ.isLoading ? (
          <Glass className="flex items-center justify-center p-12 text-sm text-foreground/55">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </Glass>
        ) : recipeQ.isError || !recipeQ.data ? (
          <Glass className="p-12 text-center text-sm text-foreground/55">
            Recipe not found.
          </Glass>
        ) : (
          <RecipeBuilder
            initial={recipeQ.data}
            cancelHref={`/dashboard/nutrition/recipes/${id}`}
            detailHrefBase="/dashboard/nutrition/recipes"
          />
        )}
      </div>
    </OwnerLayout>
  );
}

interface WorkspaceSummary { practiceName: string; ownerName: string; initials: string }

function readWorkspaceSummary(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName, initials };
}
