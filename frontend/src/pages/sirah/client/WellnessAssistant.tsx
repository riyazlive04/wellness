import { useQuery } from '@tanstack/react-query';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { AssistantChat } from '@/modules/assistant/AssistantChat';
import { useClientAssistant } from '@/modules/assistant/useClientAssistant';
import { Link } from 'react-router-dom';
import { MessageCircle, Sparkles } from 'lucide-react';

/**
 * Wellness AI — the client's personal wellness companion (Module 6). Mounts the
 * shared assistant surface inside the client portal shell.
 */
export default function ClientWellnessAssistant() {
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const { available, loading } = useClientAssistant();
  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      {available || loading ? (
        <AssistantChat />
      ) : (
        // The practice hasn't switched the assistant on (or has no AI key yet).
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-foreground/[0.05]">
            <Sparkles className="h-5 w-5 text-foreground/45" />
          </div>
          <div className="text-base font-semibold">The AI assistant isn't on for your practice</div>
          <p className="text-sm text-foreground/60">Your nutritionist can answer your questions directly in Chat.</p>
          <Link
            to="/portal/chat"
            className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-sm font-semibold text-white"
          >
            <MessageCircle className="h-4 w-4" /> Message your nutritionist
          </Link>
        </div>
      )}
    </ClientLayout>
  );
}
