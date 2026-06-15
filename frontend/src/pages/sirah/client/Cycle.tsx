import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Calendar, Droplet, Loader2, Plus, Sparkles, X, Trash2, Moon, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type CycleEvent, type CycleEventType } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Period / cycle tracker — log events (period start/end, ovulation, PMS,
 * cramps, spotting), see history, get cycle-length prediction.
 */

const EVENT_META: Record<CycleEventType, { label: string; tone: string }> = {
  period_start: { label: 'Period started', tone: 'bg-rose-500/15 text-rose-700 dark:text-rose-200' },
  period_end:   { label: 'Period ended',   tone: 'bg-rose-500/15 text-rose-700 dark:text-rose-200' },
  ovulation:    { label: 'Ovulation',      tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200' },
  pms:          { label: 'PMS',            tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-200' },
  cramps:       { label: 'Cramps',         tone: 'bg-rose-500/15 text-rose-700 dark:text-rose-200' },
  spotting:     { label: 'Spotting',       tone: 'bg-pink-500/15 text-pink-700 dark:text-pink-200' },
};

export default function ClientCycle() {
  const queryClient = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const eventsQ = useQuery({ queryKey: ['me', 'cycle'], queryFn: () => clientsApi.cycleEvents(180), retry: 1 });
  const predQ = useQuery({ queryKey: ['me', 'cycle-prediction'], queryFn: () => clientsApi.cyclePrediction(), retry: 1 });

  const events = eventsQ.data ?? [];
  const prediction = predQ.data;

  const [open, setOpen] = useState(false);

  const phaseToday = useMemo(() => computePhase(prediction ?? null), [prediction]);

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">

        <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Body · Cycle</span>
            <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Your cycle, your rhythm.</h1>
            <p className="mt-2 max-w-2xl text-sm text-foreground/65">
              Log period and other cycle events. We'll predict your next period and fertile window from your history.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.55)]"
          >
            <Plus className="h-4 w-4" /> Log event
          </button>
        </motion.div>

        {/* Prediction summary */}
        <motion.div variants={fadeUp} className="mt-6 grid gap-3 sm:grid-cols-3">
          <Glass className="p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55 inline-flex items-center gap-1.5">
              <Droplet className="h-3 w-3 text-rose-500" /> Next period
            </div>
            <div className="mt-1 text-lg font-semibold">
              {prediction?.predicted_next_period
                ? formatDate(prediction.predicted_next_period)
                : <span className="text-foreground/55 text-sm">Need 2+ cycles to predict</span>}
            </div>
            {prediction?.predicted_next_period && (
              <div className="mt-0.5 text-[11px] text-foreground/55">
                in {daysFromNow(prediction.predicted_next_period)} days
              </div>
            )}
          </Glass>

          <Glass className="p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55 inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-emerald-500" /> Fertile window
            </div>
            <div className="mt-1 text-lg font-semibold">
              {prediction?.fertile_window_start && prediction.fertile_window_end
                ? `${formatDate(prediction.fertile_window_start, true)} – ${formatDate(prediction.fertile_window_end, true)}`
                : <span className="text-foreground/55 text-sm">—</span>}
            </div>
          </Glass>

          <Glass className="p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55 inline-flex items-center gap-1.5">
              <Calendar className="h-3 w-3 text-violet-500" /> Cycle length
            </div>
            <div className="mt-1 text-lg font-semibold">
              {prediction?.cycle_length_days
                ? `${prediction.cycle_length_days} days`
                : <span className="text-foreground/55 text-sm">—</span>}
            </div>
            {phaseToday && (
              <div className="mt-0.5 text-[11px] text-foreground/55">Today: {phaseToday}</div>
            )}
          </Glass>
        </motion.div>

        {/* History */}
        <motion.div variants={fadeUp} className="mt-8">
          <h2 className="mb-3 text-base font-semibold">History</h2>
          {eventsQ.isLoading ? (
            <Glass className="flex items-center justify-center p-8 text-sm text-foreground/55">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </Glass>
          ) : events.length === 0 ? (
            <Glass className="flex flex-col items-center gap-2 p-8 text-center">
              <Moon className="h-6 w-6 text-foreground/35" />
              <div className="text-sm text-foreground/65">No events yet. Log your last period start to begin.</div>
            </Glass>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <EventRow key={e.id} ev={e} onDeleted={() => {
                  queryClient.invalidateQueries({ queryKey: ['me', 'cycle'] });
                  queryClient.invalidateQueries({ queryKey: ['me', 'cycle-prediction'] });
                }} />
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>

      {open && <LogDialog onClose={() => setOpen(false)} />}
    </ClientLayout>
  );
}

function EventRow({ ev, onDeleted }: { ev: CycleEvent; onDeleted: () => void }) {
  const meta = EVENT_META[ev.event_type];
  const del = useMutation({
    mutationFn: () => clientsApi.deleteCycleEvent(ev.id),
    onSuccess: () => { toast.success('Removed.'); onDeleted(); },
    onError: (err: Error) => toast.error(err.message ?? 'Could not delete.'),
  });
  return (
    <Glass className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full px-1.5 py-0 text-[10px] uppercase tracking-[0.18em]', meta.tone)}>
            {meta.label}
          </span>
          {ev.flow_level != null && ev.flow_level > 0 && (
            <span className="text-[11px] text-foreground/65">Flow {ev.flow_level}/3</span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-foreground/55">{formatDate(ev.event_date)}</div>
        {ev.notes && <div className="mt-1 text-xs text-foreground/75">{ev.notes}</div>}
      </div>
      <button
        type="button"
        onClick={() => { if (confirm('Delete this entry?')) del.mutate(); }}
        className="text-foreground/45 hover:text-rose-600"
        aria-label="Delete"
      ><Trash2 className="h-3.5 w-3.5" /></button>
    </Glass>
  );
}

function LogDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<CycleEventType>('period_start');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [flow, setFlow] = useState<number>(2);
  const [notes, setNotes] = useState('');

  const log = useMutation({
    mutationFn: () => clientsApi.logCycleEvent({
      event_type: type,
      event_date: date,
      flow_level: type === 'period_start' || type === 'spotting' ? flow : undefined,
      notes: notes.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success('Logged.');
      queryClient.invalidateQueries({ queryKey: ['me', 'cycle'] });
      queryClient.invalidateQueries({ queryKey: ['me', 'cycle-prediction'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not save.'),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 " onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-foreground/[0.08] bg-popover shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-foreground/[0.06] px-5 py-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Cycle</div>
            <div className="text-base font-semibold">Log an event</div>
          </div>
          <button type="button" onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-foreground/65 hover:bg-foreground/[0.05]"
            aria-label="Close"><X className="h-4 w-4" /></button>
        </header>
        <div className="space-y-4 p-5">
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">Event</div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(EVENT_META) as CycleEventType[]).map((k) => {
                const active = type === k;
                return (
                  <button key={k} type="button" onClick={() => setType(k)}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-left text-xs transition-colors',
                      active
                        ? 'border-violet-400/60 bg-violet-400/10'
                        : 'border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.05]',
                    )}>
                    {EVENT_META[k].label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">Date</div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:outline-none" />
          </div>
          {(type === 'period_start' || type === 'spotting') && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-foreground/75">Flow</div>
              <div className="flex items-center gap-2">
                {['Light', 'Medium', 'Heavy'].map((label, idx) => {
                  const v = idx + 1;
                  return (
                    <button key={v} type="button" onClick={() => setFlow(v)}
                      className={cn(
                        'flex-1 rounded-xl border px-3 py-2 text-xs transition-colors',
                        flow === v
                          ? 'border-violet-400/60 bg-violet-400/10'
                          : 'border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.05]',
                      )}>{label}</button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">Notes (optional)</div>
            <textarea rows={2} maxLength={500} value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:outline-none" />
          </div>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-foreground/[0.06] bg-foreground/[0.02] px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-full px-4 py-1.5 text-sm text-foreground/75 hover:bg-foreground/[0.05]">Cancel</button>
          <button type="button" onClick={() => log.mutate()} disabled={log.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {log.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </footer>
      </motion.div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────

function formatDate(iso: string, short = false): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', short
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}
function daysFromNow(iso: string): number {
  const target = new Date(iso).getTime();
  return Math.max(0, Math.round((target - Date.now()) / 86_400_000));
}
function computePhase(p: { last_period_start: string | null; cycle_length_days: number | null } | null): string | null {
  if (!p?.last_period_start || !p.cycle_length_days) return null;
  const since = Math.round((Date.now() - new Date(p.last_period_start).getTime()) / 86_400_000);
  const day = since % p.cycle_length_days;
  if (day < 5)             return 'Menstrual phase';
  if (day < p.cycle_length_days - 14) return 'Follicular phase';
  if (day < p.cycle_length_days - 12) return 'Ovulation';
  return 'Luteal phase';
}