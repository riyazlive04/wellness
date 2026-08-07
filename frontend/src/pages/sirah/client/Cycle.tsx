import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Calendar, Droplet, Loader2, Plus, Sparkles, X, Trash2, Moon, Activity, History,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type CycleEvent, type CycleEventType } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Period / cycle tracker — log events (period start/end, ovulation, PMS,
 * cramps, spotting), see history, get cycle-length prediction.
 */

const EVENT_META: Record<CycleEventType, { tone: string }> = {
  period_start: { tone: 'bg-rose-500/15 text-rose-700 dark:text-rose-200' },
  period_end:   { tone: 'bg-rose-500/15 text-rose-700 dark:text-rose-200' },
  ovulation:    { tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200' },
  pms:          { tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-200' },
  cramps:       { tone: 'bg-rose-500/15 text-rose-700 dark:text-rose-200' },
  spotting:     { tone: 'bg-pink-500/15 text-pink-700 dark:text-pink-200' },
};

export default function ClientCycle() {
  const { t } = useTranslation('clientCycle');
  const queryClient = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const eventsQ = useQuery({ queryKey: ['me', 'cycle'], queryFn: () => clientsApi.cycleEvents(180), retry: 1 });
  const predQ = useQuery({ queryKey: ['me', 'cycle-prediction'], queryFn: () => clientsApi.cyclePrediction(), retry: 1 });

  const events = eventsQ.data ?? [];
  const prediction = predQ.data;

  const [open, setOpen] = useState(false);

  const phaseToday = useMemo(() => computePhase(prediction ?? null), [prediction]);
  const cycleDay = useMemo(() => computeCycleDay(prediction ?? null), [prediction]);

  const invalidateCycle = () => {
    queryClient.invalidateQueries({ queryKey: ['me', 'cycle'] });
    queryClient.invalidateQueries({ queryKey: ['me', 'cycle-prediction'] });
  };

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <div className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 md:px-8 md:py-10">
        <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-7">

          {/* ── Header ──────────────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-300">
                <Droplet className="h-4 w-4" />
                <span className="text-xs uppercase tracking-[0.18em]">{t('eyebrow')}</span>
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">{t('title')}</h1>
              <p className="mt-1.5 max-w-2xl text-sm text-foreground/60">
                {t('subtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(14,154,168,0.55)] transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
            >
              <Plus className="h-4 w-4" /> {t('logEvent')}
            </button>
          </motion.div>

          {/* ── Stat strip ──────────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Glass className="p-4">
              <div className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-rose-600 dark:text-rose-300" strokeWidth={1.8} />
                <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{t('stats.cycleDay')}</span>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">
                {cycleDay != null ? cycleDay : <span className="text-base text-foreground/45">-</span>}
              </div>
              {phaseToday && <div className="mt-0.5 text-[11px] text-foreground/55">{t(`phases.${phaseToday}.label`)}</div>}
            </Glass>

            <Glass className="p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" strokeWidth={1.8} />
                <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{t('stats.phase')}</span>
              </div>
              <div className="mt-2 text-lg font-semibold leading-tight">
                {phaseToday ? t(`phases.${phaseToday}.short`) : <span className="text-base text-foreground/45">-</span>}
              </div>
              {prediction?.fertile_window_start && prediction.fertile_window_end && (
                <div className="mt-0.5 text-[11px] text-foreground/55">
                  {t('stats.fertileRange', {
                    start: formatDate(prediction.fertile_window_start, true),
                    end: formatDate(prediction.fertile_window_end, true),
                  })}
                </div>
              )}
            </Glass>

            <Glass className="p-4">
              <div className="flex items-center gap-2">
                <Droplet className="h-3.5 w-3.5 text-rose-600 dark:text-rose-300" strokeWidth={1.8} />
                <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{t('stats.nextPeriod')}</span>
              </div>
              <div className="mt-2 text-lg font-semibold leading-tight">
                {prediction?.predicted_next_period
                  ? formatDate(prediction.predicted_next_period, true)
                  : <span className="text-base text-foreground/45">-</span>}
              </div>
              <div className="mt-0.5 text-[11px] text-foreground/55">
                {prediction?.predicted_next_period
                  ? t('stats.inDays', { count: daysFromNow(prediction.predicted_next_period) })
                  : t('stats.needCycles')}
              </div>
            </Glass>

            <Glass className="p-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-teal-600 dark:text-teal-300" strokeWidth={1.8} />
                <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{t('stats.avgLength')}</span>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">
                {prediction?.cycle_length_days
                  ? prediction.cycle_length_days
                  : <span className="text-base text-foreground/45">-</span>}
              </div>
              <div className="mt-0.5 text-[11px] text-foreground/55">
                {prediction?.cycle_length_days ? t('stats.daysPerCycle') : t('stats.days')}
              </div>
            </Glass>
          </motion.div>

          {/* ── Body: history + forecast aside ──────────────────────── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* History */}
            <motion.div variants={fadeUp} className="lg:col-span-2">
              <Glass className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-foreground/55" />
                    <span className="text-sm font-medium">{t('history.title')}</span>
                  </div>
                  <span className="text-[11px] text-foreground/45">{t('history.entries', { count: events.length })}</span>
                </div>

                {eventsQ.isLoading ? (
                  <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
                ) : events.length === 0 ? (
                  <div className="flex flex-col items-center px-5 py-16 text-center">
                    <Moon className="h-8 w-8 text-foreground/25" />
                    <div className="mt-3 text-sm text-foreground/70">{t('history.emptyTitle')}</div>
                    <div className="mt-1 text-xs text-foreground/50">{t('history.emptyDescription')}</div>
                    <button
                      type="button"
                      onClick={() => setOpen(true)}
                      className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-4 py-2 text-xs font-medium text-foreground/85 transition-colors hover:bg-foreground/[0.04]"
                    >
                      <Plus className="h-3.5 w-3.5" /> {t('history.logFirst')}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 p-4">
                    {events.map((e) => (
                      <EventRow key={e.id} ev={e} onDeleted={invalidateCycle} />
                    ))}
                  </div>
                )}
              </Glass>
            </motion.div>

            {/* Aside: forecast + tip */}
            <motion.div variants={fadeUp} className="space-y-5">
              <Glass className="overflow-hidden">
                <div className="border-b border-foreground/[0.06] px-5 py-4">
                  <span className="text-sm font-medium">{t('forecast.title')}</span>
                </div>
                <div className="divide-y divide-foreground/[0.04]">
                  <ForecastRow
                    icon={Droplet}
                    tint="text-rose-600 dark:text-rose-300"
                    label={t('forecast.nextPeriod')}
                    value={prediction?.predicted_next_period ? formatDate(prediction.predicted_next_period) : '-'}
                    sub={prediction?.predicted_next_period ? t('forecast.inDays', { count: daysFromNow(prediction.predicted_next_period) }) : t('forecast.needCycles')}
                  />
                  <ForecastRow
                    icon={Sparkles}
                    tint="text-emerald-600 dark:text-emerald-300"
                    label={t('forecast.fertileWindow')}
                    value={prediction?.fertile_window_start && prediction.fertile_window_end
                      ? `${formatDate(prediction.fertile_window_start, true)} - ${formatDate(prediction.fertile_window_end, true)}`
                      : '-'}
                  />
                  <ForecastRow
                    icon={Calendar}
                    tint="text-teal-600 dark:text-teal-300"
                    label={t('forecast.cycleLength')}
                    value={prediction?.cycle_length_days ? t('forecast.daysValue', { count: prediction.cycle_length_days }) : '-'}
                    sub={phaseToday ? t('forecast.todayPhase', { phase: t(`phases.${phaseToday}.label`) }) : undefined}
                  />
                </div>
              </Glass>

              <Glass className="p-5">
                <div className="flex items-center gap-2 text-foreground/80">
                  <Moon className="h-4 w-4 text-cyan-500" />
                  <span className="text-sm font-medium">{t('note.title')}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-foreground/60">
                  {t('note.body')}
                </p>
              </Glass>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {open && <LogDialog onClose={() => setOpen(false)} />}
    </ClientLayout>
  );
}

function ForecastRow({
  icon: Icon, tint, label, value, sub,
}: {
  icon: typeof Droplet;
  tint: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-foreground/[0.04]">
        <Icon className={cn('h-4 w-4', tint)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</div>
        <div className="truncate text-sm font-medium">{value}</div>
      </div>
      {sub && <div className="flex-shrink-0 text-right text-[11px] text-foreground/55">{sub}</div>}
    </div>
  );
}

function EventRow({ ev, onDeleted }: { ev: CycleEvent; onDeleted: () => void }) {
  const { t } = useTranslation('clientCycle');
  const meta = EVENT_META[ev.event_type];
  const del = useMutation({
    mutationFn: () => clientsApi.deleteCycleEvent(ev.id),
    onSuccess: () => { toast.success(t('event.removed')); onDeleted(); },
    onError: (err: Error) => toast.error(err.message ?? t('event.deleteError')),
  });
  return (
    <Glass className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full px-1.5 py-0 text-[10px] uppercase tracking-[0.18em]', meta.tone)}>
            {t(`eventTypes.${ev.event_type}`)}
          </span>
          {ev.flow_level != null && ev.flow_level > 0 && (
            <span className="text-[11px] text-foreground/65">{t('event.flow', { level: ev.flow_level })}</span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-foreground/55">{formatDate(ev.event_date)}</div>
        {ev.notes && <div className="mt-1 text-xs text-foreground/75">{ev.notes}</div>}
      </div>
      <button
        type="button"
        onClick={() => { if (confirm(t('event.confirmDelete'))) del.mutate(); }}
        className="text-foreground/45 hover:text-rose-600"
        aria-label={t('common:actions.delete')}
      ><Trash2 className="h-3.5 w-3.5" /></button>
    </Glass>
  );
}

function LogDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('clientCycle');
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
      toast.success(t('dialog.logged'));
      queryClient.invalidateQueries({ queryKey: ['me', 'cycle'] });
      queryClient.invalidateQueries({ queryKey: ['me', 'cycle-prediction'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message ?? t('dialog.saveError')),
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
            <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{t('dialog.eyebrow')}</div>
            <div className="text-base font-semibold">{t('dialog.title')}</div>
          </div>
          <button type="button" onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-foreground/65 hover:bg-foreground/[0.05]"
            aria-label={t('common:actions.close')}><X className="h-4 w-4" /></button>
        </header>
        <div className="space-y-4 p-5">
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">{t('dialog.eventLabel')}</div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(EVENT_META) as CycleEventType[]).map((k) => {
                const active = type === k;
                return (
                  <button key={k} type="button" onClick={() => setType(k)}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-left text-xs transition-colors',
                      active
                        ? 'border-teal-400/60 bg-teal-400/10'
                        : 'border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.05]',
                    )}>
                    {t(`eventTypes.${k}`)}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">{t('dialog.dateLabel')}</div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none" />
          </div>
          {(type === 'period_start' || type === 'spotting') && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-foreground/75">{t('dialog.flowLabel')}</div>
              <div className="flex items-center gap-2">
                {[t('dialog.flow.light'), t('dialog.flow.medium'), t('dialog.flow.heavy')].map((label, idx) => {
                  const v = idx + 1;
                  return (
                    <button key={v} type="button" onClick={() => setFlow(v)}
                      className={cn(
                        'flex-1 rounded-xl border px-3 py-2 text-xs transition-colors',
                        flow === v
                          ? 'border-teal-400/60 bg-teal-400/10'
                          : 'border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.05]',
                      )}>{label}</button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">{t('dialog.notesLabel')}</div>
            <textarea rows={2} maxLength={500} value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none" />
          </div>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-foreground/[0.06] bg-foreground/[0.02] px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-full px-4 py-1.5 text-sm text-foreground/75 hover:bg-foreground/[0.05]">{t('common:actions.cancel')}</button>
          <button type="button" onClick={() => log.mutate()} disabled={log.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {log.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t('common:actions.save')}
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
function computeCycleDay(p: { last_period_start: string | null; cycle_length_days: number | null } | null): number | null {
  if (!p?.last_period_start) return null;
  const since = Math.round((Date.now() - new Date(p.last_period_start).getTime()) / 86_400_000);
  if (since < 0) return null;
  const len = p.cycle_length_days ?? 28;
  return (since % len) + 1;
}
type PhaseKey = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';
function computePhase(p: { last_period_start: string | null; cycle_length_days: number | null } | null): PhaseKey | null {
  if (!p?.last_period_start || !p.cycle_length_days) return null;
  const since = Math.round((Date.now() - new Date(p.last_period_start).getTime()) / 86_400_000);
  const day = since % p.cycle_length_days;
  if (day < 5)             return 'menstrual';
  if (day < p.cycle_length_days - 14) return 'follicular';
  if (day < p.cycle_length_days - 12) return 'ovulation';
  return 'luteal';
}