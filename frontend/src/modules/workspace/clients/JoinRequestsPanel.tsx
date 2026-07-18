import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp } from '@/design-system';
import { clientsApi } from '../api/clients';
import { initialsOf, relativeTime } from './helpers';

/**
 * Pending join requests from the workspace link. Renders nothing when the
 * queue is empty so the roster isn't cluttered by a permanent empty state.
 *
 * Approving consumes a plan seat (the backend enforces the limit), which is
 * why a full workspace surfaces the error here rather than silently failing.
 */
export function JoinRequestsPanel() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const requestsQ = useQuery({
    queryKey: ['workspace', 'clients', 'join-requests', 'pending'],
    queryFn: () => clientsApi.listJoinRequests('pending'),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  const items = requestsQ.data?.items ?? [];
  if (requestsQ.isLoading || items.length === 0) return null;

  function refresh() {
    void qc.invalidateQueries({ queryKey: ['workspace', 'clients'] });
    // Keep the sidebar "Clients" badge honest the instant a request is decided.
    void qc.invalidateQueries({ queryKey: ['workspace', 'sidebar-badges'] });
  }

  async function decide(id: string, name: string, approve: boolean) {
    setBusyId(id);
    try {
      if (approve) {
        await clientsApi.approveJoinRequest(id);
        toast.success(`${name} is now on your roster`);
      } else {
        await clientsApi.rejectJoinRequest(id);
        toast.success(`Request from ${name} declined`);
      }
      refresh();
    } catch (err) {
      toast.error((err as Error).message ?? 'Could not update the request');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <motion.div variants={fadeUp}>
      <Glass className="overflow-hidden rounded-2xl border-amber-400/30 bg-amber-400/[0.04]">
        <header className="flex items-center gap-2 border-b border-foreground/[0.06] px-5 py-3.5">
          <UserPlus className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <h2 className="text-sm font-semibold tracking-tight">
            {items.length} {items.length === 1 ? 'person wants' : 'people want'} to join
          </h2>
          <span className="ml-auto text-[11px] text-foreground/55">Approving uses a client seat</span>
        </header>

        <ul className="divide-y divide-foreground/[0.06]">
          {items.map((r) => {
            const name = r.name ?? r.email.split('@')[0];
            const busy = busyId === r.id;
            return (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-xs font-semibold text-foreground/70">
                  {initialsOf(name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{name}</div>
                  <div className="truncate text-xs text-foreground/60">{r.email}</div>
                </div>
                <div className="hidden shrink-0 text-xs text-foreground/50 sm:block">
                  {relativeTime(r.created_at)}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => decide(r.id, name, false)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50 dark:hover:text-rose-300"
                  >
                    <X className="h-3.5 w-3.5" />
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(r.id, name, true)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-3.5 py-1.5 text-xs font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Approve
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Glass>
    </motion.div>
  );
}
