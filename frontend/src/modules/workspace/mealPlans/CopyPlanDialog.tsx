import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Loader2, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import { clientSlug, clientsApi, type ClientListItem } from '../api/clients';
import { mealPlansApi, type MealPlan } from '../api/mealPlans';

/**
 * Give another client the same week: every meal, amount, macro and the plan
 * notes are copied into a new draft week for them, so nothing is retyped.
 * The copy stays a draft so it can be adjusted before that client sees it.
 */
export function CopyPlanDialog({
  plan, fromClientId, fromClientName, defaultStart, onClose,
}: {
  plan: MealPlan;
  fromClientId: string;
  fromClientName: string;
  defaultStart: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<ClientListItem | null>(null);
  const [startDate, setStartDate] = useState(defaultStart);
  const [busy, setBusy] = useState(false);

  // Search as they type, without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const clientsQ = useQuery({
    queryKey: ['workspace', 'clients', 'copy-plan', q],
    queryFn: () => clientsApi.list({ q: q || undefined, limit: 30 }),
    staleTime: 30_000,
  });
  const options = (clientsQ.data?.items ?? []).filter((c) => c.id !== fromClientId);
  const mealCount = plan.cards?.length ?? 0;

  async function copy() {
    if (!target) return;
    setBusy(true);
    try {
      const copied = await mealPlansApi.duplicate(plan.id, startDate, target.id);
      const name = target.display_name || target.name;
      toast.success(`Copied to ${name} as week ${copied.week_number} (draft)`, {
        action: { label: 'Open', onClick: () => navigate(`/clients/${clientSlug(target.name, target.id)}/plan`) },
      });
      onClose();
    } catch (err) {
      toast.error((err as Error).message ?? 'Could not copy the plan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 md:items-center" onClick={() => !busy && onClose()}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg p-4 md:p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Glass variant="heavy" className="max-h-[85vh] overflow-y-auto rounded-2xl">
          <header className="flex items-start justify-between px-6 pt-6">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <Copy className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                Copy week {plan.week_number} to another client
              </h2>
              <p className="mt-1 text-xs text-foreground/60">
                All {mealCount} meal{mealCount === 1 ? '' : 's'} from {fromClientName}&apos;s week, with amounts, macros and notes.
                It arrives as a draft you can adjust before publishing.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-foreground/60 hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="space-y-4 px-6 pb-6 pt-4">
            <div>
              <div className="mb-1.5 text-xs font-medium text-foreground/70">Copy to</div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search clients by name or email"
                  className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] py-2.5 pl-9 pr-3.5 text-sm focus:border-teal-400/60 focus:outline-none"
                />
              </div>
              <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-foreground/[0.08]">
                {clientsQ.isLoading ? (
                  <div className="flex items-center gap-2 px-3.5 py-3 text-xs text-foreground/55">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading clients…
                  </div>
                ) : clientsQ.isError ? (
                  <div className="flex items-center justify-between gap-2 px-3.5 py-3 text-xs text-rose-600 dark:text-rose-300">
                    Couldn&apos;t load your clients.
                    <button type="button" onClick={() => void clientsQ.refetch()} className="font-semibold underline">Try again</button>
                  </div>
                ) : options.length === 0 ? (
                  <div className="px-3.5 py-3 text-xs text-foreground/55">
                    {q ? `No other client matches "${q}".` : 'No other clients yet.'}
                  </div>
                ) : (
                  options.map((c) => {
                    const on = target?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setTarget(c)}
                        className={cn(
                          'flex w-full items-center gap-3 border-b border-foreground/[0.05] px-3.5 py-2.5 text-left last:border-b-0',
                          on ? 'bg-teal-500/10' : 'hover:bg-foreground/[0.03]',
                        )}
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-xs font-semibold">
                          {(c.display_name || c.name || '?').slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{c.display_name || c.name}</span>
                          <span className="block truncate text-[11px] text-foreground/55">{c.email}</span>
                        </span>
                        {on && <Check className="h-4 w-4 text-teal-600 dark:text-teal-400" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <label className="block">
              <div className="mb-1.5 text-xs font-medium text-foreground/70">Week starts on</div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none"
              />
            </label>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/70 hover:bg-foreground/[0.04] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void copy()}
                disabled={!target || !startDate || busy}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-40 disabled:hover:scale-100"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                {target ? `Copy to ${target.display_name || target.name}` : 'Pick a client'}
              </button>
            </div>
          </div>
        </Glass>
      </motion.div>
    </div>
  );
}
