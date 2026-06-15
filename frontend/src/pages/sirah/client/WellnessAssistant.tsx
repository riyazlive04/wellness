import { useQuery } from '@tanstack/react-query';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { AssistantChat } from '@/modules/assistant/AssistantChat';

/**
 * Wellness AI — the client's personal wellness companion (Module 6). Mounts the
 * shared assistant surface inside the client portal shell.
 */
export default function ClientWellnessAssistant() {
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <AssistantChat />
    </ClientLayout>
  );
}
