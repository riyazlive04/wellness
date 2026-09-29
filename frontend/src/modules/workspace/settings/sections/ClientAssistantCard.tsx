import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessagesSquare } from 'lucide-react';
import { toast } from 'sonner';

import { clientAssistantApi, type ClientAssistantSettings } from '@/modules/workspace/api/clientAssistant';
import { useScope } from '@/hooks/useScope';
import { featuresOf } from '@/lib/planCapabilities';
import { cn } from '@/lib/utils';

const LIMITS = [5, 10, 20, 50];

/**
 * Settings -> AI: whether this practice's clients can chat with the AI
 * assistant in their portal. Off by default; the owner decides.
 */
export function ClientAssistantCard({ isOwner }: { isOwner: boolean }) {
  const { data: scope } = useScope();
  const onPlan = featuresOf(scope).includes('ai_assistant');
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['workspace', 'client-assistant'],
    queryFn: clientAssistantApi.get,
    enabled: onPlan,
  });

  const save = useMutation({
    mutationFn: (patch: Partial<ClientAssistantSettings>) => clientAssistantApi.update(patch),
    onSuccess: (s, patch) => {
      qc.setQueryData(['workspace', 'client-assistant'], s);
      if (patch.enabled !== undefined) {
        toast.success(s.enabled ? 'Clients can now chat with the AI assistant.' : 'Client AI assistant switched off.');
      } else {
        toast.success(`Limit set to ${s.daily_limit} questions per client per day.`);
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save.'),
  });

  if (!onPlan || !q.data) return null;
  const s = q.data;
  const enabled = save.isPending && save.variables?.enabled !== undefined ? !!save.variables.enabled : s.enabled;

  return (
    <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <MessagesSquare className="mt-0.5 h-5 w-5 flex-shrink-0 text-[hsl(var(--brand-blue))]" />
          <div>
            <div className="text-sm font-semibold text-foreground">Client AI assistant</div>
            <p className="mt-0.5 max-w-xl text-xs text-foreground/65">
              Let your clients ask an AI assistant about their own plan and progress in their app. Every
              question uses one of your AI credits, and you can read their chats on each client's page
              (AI chats tab).
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Client AI assistant"
          disabled={!isOwner || save.isPending}
          onClick={() => save.mutate({ enabled: !s.enabled })}
          className={cn(
            'relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-60',
            enabled ? 'bg-[hsl(var(--brand-blue))]' : 'bg-foreground/20',
          )}
        >
          <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', enabled ? 'left-[22px]' : 'left-0.5')} />
        </button>
      </div>

      {enabled && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-foreground/[0.06] pt-4">
          <span className="text-xs text-foreground/70">Questions per client per day:</span>
          {LIMITS.map((n) => (
            <button
              key={n}
              type="button"
              disabled={!isOwner || save.isPending}
              onClick={() => save.mutate({ daily_limit: n })}
              className={cn(
                'rounded-full border px-3 py-1 text-xs tabular-nums transition-colors disabled:opacity-60',
                s.daily_limit === n
                  ? 'border-[hsl(var(--brand-blue))]/40 bg-[hsl(var(--brand-blue))]/[0.08] font-semibold'
                  : 'border-foreground/10 hover:bg-foreground/[0.04]',
              )}
            >
              {n}
            </button>
          ))}
          {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/40" />}
        </div>
      )}
      {!isOwner && <p className="mt-3 text-[11px] text-foreground/50">Only the practice owner can change this.</p>}
    </div>
  );
}
