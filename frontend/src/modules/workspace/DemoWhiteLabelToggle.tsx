import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { workspacesApi } from '@/modules/workspace/api/workspaces';

/**
 * White-label on/off, on the dashboard itself.
 *
 * The real control lives in Settings -> Branding, which is the right home for
 * it. This exists because a demo is a conversation: walking away to a settings
 * page to show NUSI's name disappearing loses the room, so the switch sits
 * where the attribution it removes is visible.
 *
 * Shown only on the demo workspace, keyed off the same /demo/accounts call the
 * account switcher uses - a real practice gets an empty list and renders
 * nothing. Only an owner can write branding, so a demo staff account sees it
 * disabled rather than getting a 403 mid-sentence.
 */

interface DemoAccount {
  user_id: string;
  role: string;
  current: boolean;
}

export function DemoWhiteLabelToggle() {
  const qc = useQueryClient();

  const demoQ = useQuery({
    queryKey: ['demo', 'accounts'],
    queryFn: () => api.get<DemoAccount[]>('/api/v1/demo/accounts'),
    staleTime: 10 * 60_000,
    retry: false,
  });

  const brandingQ = useQuery({
    queryKey: ['workspace', 'branding'],
    queryFn: () => workspacesApi.branding(),
  });

  const mut = useMutation({
    mutationFn: (next: boolean) => workspacesApi.updateBranding({ white_label: next }),
    onSuccess: (_d, next) => {
      // The footer and the client portal both read this, so refresh anything
      // branding-shaped rather than just this card.
      void qc.invalidateQueries({ queryKey: ['workspace'] });
      toast.success(
        next
          ? 'White-label on — NUSI’s name is hidden.'
          : 'White-label off — “Powered by Sirah Digital” is back.',
      );
    },
    onError: (e: Error) =>
      toast.error(e instanceof ApiError ? e.message : 'Could not change white-label.'),
  });

  const accounts = demoQ.data ?? [];
  if (accounts.length < 2) return null;   // not the demo workspace

  const isOwner = accounts.find((a) => a.current)?.role === 'owner';
  const on = !!brandingQ.data?.white_label;
  const busy = mut.isPending || brandingQ.isLoading;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border px-4 py-3',
        on
          ? 'border-teal-500/30 bg-teal-500/[0.07]'
          : 'border-foreground/[0.08] bg-card',
      )}
    >
      <span
        className={cn(
          'grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl',
          on ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300' : 'bg-foreground/[0.05] text-foreground/45',
        )}
      >
        <Sparkles className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-700/80 dark:text-amber-300/70">
          Demo control
        </div>
        <div className="text-sm font-semibold">White-label</div>
        <div className="text-[11px] leading-relaxed text-foreground/50">
          {isOwner
            ? on
              ? 'NUSI’s name is hidden from this practice and its clients.'
              : '“Powered by Sirah Digital” shows on the dashboard and client app.'
            : 'Switch to the Owner account to change this.'}
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="White-label"
        disabled={busy || !isOwner}
        onClick={() => mut.mutate(!on)}
        className={cn(
          'relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-40',
          on ? 'bg-teal-600' : 'bg-foreground/20',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-all',
            on ? 'left-[22px]' : 'left-0.5',
          )}
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin text-foreground/50" />}
        </span>
      </button>
    </div>
  );
}
