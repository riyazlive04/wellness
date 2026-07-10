import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { FoodLibrary } from '@/modules/nutrition/FoodLibrary';
import { FoodDetailView } from '@/modules/nutrition/FoodDetailView';
import { clientsApi } from '@/modules/workspace/api/clients';

/**
 * Client-side food lookup. Same FoodLibrary component as nutritionist, just
 * a read-only context. Useful as a "how many calories in X?" tool.
 *
 * Two routes share this file:
 *   /portal/foods       → list
 *   /portal/foods/:id   → detail
 */
export default function ClientFoods() {
  const { id } = useParams<{ id?: string }>();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
        {id ? (
          <FoodDetailView foodId={id} backHref="/portal/foods" />
        ) : (
          <FoodLibrary detailHrefBase="/portal/foods" heroEyebrow="Lookup · IFCT 2017" showPdf={false} />
        )}
      </div>
    </ClientLayout>
  );
}
