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

/** YYYY-MM-DD plus `days`, in local time. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** "1", "1 and 2", "1, 2 and 3". */
function weekList(nums: number[]): string {
  return nums.length < 2 ? String(nums[0] ?? '') : `${nums.slice(0, -1).join(', ')} and ${nums[nums.length - 1]}`;
}

/**
 * Give another client the same weeks: every meal, amount, macro and the plan
 * notes are copied into new draft weeks for them, so nothing is retyped.
 * Several weeks land back to back from the chosen start. The copies stay drafts
 * so they can be adjusted before that client sees them.
 */
export function CopyPlanDialog({
  plans, currentPlanId, fromClientId, fromClientName, defaultStart, onClose,
}: {
  /** All of this client's weeks; the open one is picked to start with. */
  plans: MealPlan[];
  currentPlanId: string;
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
  const weeks = [...plans].sort((a, b) => a.week_number - b.week_number || a.start_date.localeCompare(b.start_date));
  const [picked, setPicked] = useState<Set<string>>(() => new Set([currentPlanId]));
  const chosen = weeks.filter((w) => picked.has(w.id) && w.total_kcal > 0);
  const toggleWeek = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
  async function copy() {
    if (!target || !chosen.length) return;
    setBusy(true);
    const name = target.display_name || target.name;
    const open = { label: 'Open', onClick: () => navigate(`/clients/${clientSlug(target.name, target.id)}/plan`) };
    const made: number[] = [];
    try {
      // One after another, so each lands as that client's next week, in order.
      for (const [i, w] of chosen.entries()) {
        const copied = await mealPlansApi.duplicate(w.id, addDays(startDate, i * 7), target.id);
        made.push(copied.week_number);
      }
      const many = chosen.length > 1;
      toast.success(
        `Copied week${many ? 's' : ''} ${weekList(chosen.map((w) => w.week_number))} to ${name} as week${many ? 's' : ''} ${weekList(made)} (draft${many ? 's' : ''})`,
        { action: open },
      );
      onClose();
    } catch (err) {
      const msg = (err as Error).message ?? 'Could not copy the plan';
      if (made.length) toast.error(`${made.length} of ${chosen.length} weeks copied to ${name}; the rest failed: ${msg}`, { action: open });
      else toast.error(msg);
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
                Copy {fromClientName}&apos;s meal plan to another client
              </h2>
              <p className="mt-1 text-xs text-foreground/60">
                Every meal of the weeks you pick, with amounts, macros and notes. They arrive as drafts you can adjust before publishing.
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
              <div className="mb-1.5 text-xs font-medium text-foreground/70">Which week{weeks.length > 1 ? 's' : ''}</div>
              <div className="flex flex-wrap gap-2">
                {weeks.map((w) => {
                  const on = picked.has(w.id);
                  const empty = w.total_kcal === 0;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      disabled={empty}
                      onClick={() => toggleWeek(w.id)}
                      title={empty ? 'This week has no meals yet' : undefined}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-40',
                        on ? 'border-teal-500/60 bg-teal-500/10' : 'border-foreground/10 hover:bg-foreground/[0.03]',
                      )}
                    >
                      <span className={cn('grid h-4 w-4 shrink-0 place-items-center rounded border', on ? 'border-teal-600 bg-teal-600 text-white' : 'border-foreground/30')}>
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">Week {w.week_number}</span>
                        <span className="block text-[11px] text-foreground/55">
                          {shortDate(w.start_date)} - {shortDate(w.end_date)} · {empty ? 'no meals' : `${w.total_kcal.toLocaleString('en-IN')} kcal`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

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
              <div className="mb-1.5 text-xs font-medium text-foreground/70">{chosen.length > 1 ? 'First week starts on' : 'Week starts on'}</div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none"
              />
              {chosen.length > 1 && startDate && (
                <p className="mt-1.5 text-[11px] text-foreground/55">
                  {chosen.map((w, i) => `Week ${w.week_number} → ${shortDate(addDays(startDate, i * 7))}`).join(' · ')}
                </p>
              )}
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
                disabled={!target || !startDate || !chosen.length || busy}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-40 disabled:hover:scale-100"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                {!chosen.length
                  ? 'Pick a week'
                  : !target
                    ? 'Pick a client'
                    : `Copy ${chosen.length > 1 ? `${chosen.length} weeks` : `week ${chosen[0].week_number}`} to ${target.display_name || target.name}`}
              </button>
            </div>
          </div>
        </Glass>
      </motion.div>
    </div>
  );
}
