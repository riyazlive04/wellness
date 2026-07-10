import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { FoodLibrary } from '@/modules/nutrition/FoodLibrary';

/**
 * Nutritionist-facing food library at /dashboard/nutrition/foods.
 * Reads from the same /api/v1/nutrition/* endpoints as the client + admin
 * variants. Wraps the shared FoodLibrary component in the OwnerLayout shell.
 */
export default function OwnerNutritionFoods() {
  const workspace = readWorkspaceSummary();
  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext="Nutrition · IFCT 2017"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <FoodLibrary
          detailHrefBase="/dashboard/nutrition/foods"
          heroEyebrow="Reference · IFCT 2017"
          allowAdd
        />
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
