import { useParams } from 'react-router-dom';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { FoodDetailView } from '@/modules/nutrition/FoodDetailView';

export default function OwnerNutritionFoodDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const workspace = readWorkspaceSummary();
  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext="Nutrition · Food detail"
    >
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
        <FoodDetailView foodId={id} backHref="/dashboard/nutrition/foods" />
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
