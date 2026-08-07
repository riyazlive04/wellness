import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Ruler, Plus, Loader2, Trash2, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type Measurement } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Body measurements tracker — inches-based. The legacy Sheizen platform had
 * this as a hidden component; we promote it to a top-level page because
 * inches-lost is a stronger weight-loss signal than kg-lost.
 */

const FIELDS: Array<{ key: keyof Pick<Measurement, 'arm_inches' | 'chest_inches' | 'waist_inches' | 'hip_inches' | 'thigh_inches'>; label: string }> = [
  { key: 'arm_inches',   label: 'Arm' },
  { key: 'chest_inches', label: 'Chest' },
  { key: 'waist_inches', label: 'Waist' },
  { key: 'hip_inches',   label: 'Hip' },
  { key: 'thigh_inches', label: 'Thigh' },
];

export default function ClientMeasurements() {
  const { t } = useTranslation('clientMeasurements');
  const queryClient = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const measurementsQ = useQuery({
    queryKey: ['me', 'measurements'],
    queryFn: () => clientsApi.myMeasurements(60),
    retry: 1,
  });

  const list = measurementsQ.data ?? [];
  // Compare latest entry vs the one before to show deltas.
  const latest   = list[0] ?? null;
  const previous = list[1] ?? null;

  const totalChange = useMemo(() => {
    if (!latest || list.length < 2) return null;
    const first = list[list.length - 1];
    const diff = (a: number | null, b: number | null) =>
      a != null && b != null ? +(a - b).toFixed(2) : null;
    return {
      arm:    diff(latest.arm_inches,    first.arm_inches),
      chest:  diff(latest.chest_inches,  first.chest_inches),
      waist:  diff(latest.waist_inches,  first.waist_inches),
      hip:    diff(latest.hip_inches,    first.hip_inches),
      thigh:  diff(latest.thigh_inches,  first.thigh_inches),
    };
  }, [latest, list]);

  const [open, setOpen] = useState(false);

  // Net inches lost across every tracked field (negative delta = lost).
  const totalInchesLost = useMemo(() => {
    if (!totalChange) return null;
    const vals = Object.values(totalChange).filter((v): v is number => v != null);
    if (!vals.length) return null;
    return +vals.reduce((s, v) => s + v, 0).toFixed(1);
  }, [totalChange]);

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <div className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 md:px-8 md:py-10">
        <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-7">

          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-teal-600 dark:text-teal-300">
                <Ruler className="h-4 w-4" /><span className="text-xs uppercase tracking-[0.18em]">{t('header.eyebrow')}</span>
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">{t('header.title')}</h1>
              <p className="mt-1.5 max-w-2xl text-sm text-foreground/60">
                {t('header.subtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(14,154,168,0.55)] transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
            >
              <Plus className="h-4 w-4" /> {t('header.logMeasurement')}
            </button>
          </motion.div>

          {/* Stat strip - latest measurements + net change */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STAT_FIELDS.map((f) => {
              const cur = latest?.[f.key] ?? null;
              const prev = previous?.[f.key] ?? null;
              const delta = cur != null && prev != null ? +(cur - prev).toFixed(2) : null;
              return (
                <Glass key={f.key} className="p-4">
                  <div className="flex items-center gap-2">
                    <Ruler className={cn('h-3.5 w-3.5', f.tint)} strokeWidth={1.8} />
                    <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{t(`fields.${f.key}`)}</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-semibold tabular-nums">{cur != null ? cur.toFixed(1) : '-'}</span>
                    {cur != null && <span className="text-xs text-foreground/55">in</span>}
                  </div>
                  {delta != null && delta !== 0 && (
                    <div className={cn(
                      'mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]',
                      delta < 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                 : 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
                    )}>
                      {delta < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                      {delta > 0 ? '+' : ''}{delta.toFixed(1)} {t('stat.sinceLast')}
                    </div>
                  )}
                </Glass>
              );
            })}
          </motion.div>

          {/* Body: latest snapshot + history (main) · summary aside */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Main column */}
            <div className="space-y-5 lg:col-span-2">
              {/* Latest full snapshot */}
              <motion.div variants={fadeUp}>
                <Glass className="overflow-hidden">
                  <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                    <div>
                      <div className="text-sm font-medium">{t('snapshot.title')}</div>
                      <div className="text-xs text-foreground/60">
                        {latest
                          ? new Date(latest.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                          : t('snapshot.noEntries')}
                      </div>
                    </div>
                    <Ruler className="h-4 w-4 text-foreground/55" />
                  </div>

                  {latest ? (
                    <div className="grid grid-cols-2 gap-px bg-foreground/[0.06] sm:grid-cols-3">
                      {FIELDS.map((f) => {
                        const cur = latest[f.key];
                        const prev = previous?.[f.key];
                        const delta = cur != null && prev != null ? +(cur - prev).toFixed(2) : null;
                        const total = totalChange?.[f.key.replace('_inches', '') as keyof NonNullable<typeof totalChange>];
                        return (
                          <div key={f.key} className="bg-canvas p-4">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{t(`fields.${f.key}`)}</div>
                            <div className="mt-1 flex items-baseline gap-1.5">
                              <span className="text-xl font-semibold tabular-nums">{cur != null ? cur.toFixed(1) : '-'}</span>
                              {cur != null && <span className="text-xs text-foreground/55">in</span>}
                            </div>
                            {delta != null && delta !== 0 && (
                              <div className={cn(
                                'mt-1.5 inline-flex items-center gap-1 text-[11px]',
                                delta < 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300',
                              )}>
                                {delta < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                                {delta > 0 ? '+' : ''}{delta.toFixed(1)} {t('snapshot.fromLast')}
                              </div>
                            )}
                            {total != null && (
                              <div className="mt-0.5 text-[10px] text-foreground/55">
                                {t('snapshot.total')} {total > 0 ? '+' : ''}{total.toFixed(1)} in
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
                      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)]">
                        <Ruler className="h-6 w-6 text-teal-600 dark:text-teal-300" />
                      </div>
                      <div className="text-sm text-foreground/70">{t('snapshot.emptyTitle')}</div>
                      <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-sm font-medium text-white"
                      >
                        <Plus className="h-4 w-4" /> {t('snapshot.addBaseline')}
                      </button>
                    </div>
                  )}
                </Glass>
              </motion.div>

              {/* History */}
              {list.length > 0 && (
                <motion.div variants={fadeUp}>
                  <Glass className="overflow-hidden">
                    <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                      <span className="text-sm font-medium">{t('history.title')}</span>
                      <span className="text-[11px] text-foreground/45">{t('history.entries', { count: list.length })}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-foreground/[0.06] bg-foreground/[0.02] text-[10px] uppercase tracking-[0.16em] text-foreground/55">
                          <tr>
                            <th className="px-4 py-2.5 text-left">{t('history.columnWhen')}</th>
                            {FIELDS.map((f) => (
                              <th key={f.key} className="px-4 py-2.5 text-right">{t(`fields.${f.key}`)}</th>
                            ))}
                            <th className="px-4 py-2.5 text-right" />
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((m) => (
                            <Row key={m.id} m={m} onDeleted={() => {
                              queryClient.invalidateQueries({ queryKey: ['me', 'measurements'] });
                            }} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Glass>
                </motion.div>
              )}
            </div>

            {/* Aside */}
            <motion.div variants={fadeUp} className="space-y-5">
              {/* Progress summary */}
              <Glass className="overflow-hidden">
                <div className="border-b border-foreground/[0.06] px-5 py-4">
                  <span className="text-sm font-medium">{t('summary.title')}</span>
                </div>
                {totalChange ? (
                  <div className="p-5">
                    <div className="rounded-2xl bg-gradient-to-br from-emerald-500/[0.08] to-blue-500/[0.06] p-4">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{t('summary.netChange')}</div>
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-3xl font-semibold tabular-nums">
                          {totalInchesLost != null ? `${totalInchesLost > 0 ? '+' : ''}${totalInchesLost}` : '-'}
                        </span>
                        <span className="text-sm text-foreground/55">in</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-foreground/55">{t('summary.sinceFirst')}</div>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {FIELDS.map((f) => {
                        const total = totalChange[f.key.replace('_inches', '') as keyof NonNullable<typeof totalChange>];
                        if (total == null) return null;
                        return (
                          <li key={f.key} className="flex items-center justify-between rounded-xl border border-foreground/[0.06] bg-foreground/[0.015] px-3 py-2">
                            <span className="text-xs text-foreground/70">{t(`fields.${f.key}`)}</span>
                            <span className={cn(
                              'inline-flex items-center gap-1 text-xs font-medium tabular-nums',
                              total < 0 ? 'text-emerald-700 dark:text-emerald-300'
                                        : total > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-foreground/55',
                            )}>
                              {total < 0 ? <TrendingDown className="h-3 w-3" /> : total > 0 ? <TrendingUp className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                              {total > 0 ? '+' : ''}{total.toFixed(1)} in
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <div className="flex flex-col items-center px-5 py-10 text-center">
                    <TrendingDown className="h-7 w-7 text-foreground/25" />
                    <div className="mt-3 text-sm text-foreground/70">{t('summary.notEnoughTitle')}</div>
                    <div className="mt-1 text-xs text-foreground/50">{t('summary.notEnoughSubtitle')}</div>
                  </div>
                )}
              </Glass>

              {/* Tip card */}
              <Glass className="p-5">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-300">
                  <Ruler className="h-3.5 w-3.5" strokeWidth={1.8} />
                  <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{t('tip.title')}</span>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-foreground/65">
                  {t('tip.body')}
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

/** Four headline fields for the top stat strip (waist is the strongest signal). */
const STAT_FIELDS: Array<{ key: (typeof FIELDS)[number]['key']; label: string; tint: string }> = [
  { key: 'waist_inches', label: 'Waist', tint: 'text-teal-600 dark:text-teal-300' },
  { key: 'chest_inches', label: 'Chest', tint: 'text-blue-600 dark:text-blue-300' },
  { key: 'hip_inches',   label: 'Hip',   tint: 'text-cyan-600 dark:text-cyan-300' },
  { key: 'arm_inches',   label: 'Arm',   tint: 'text-emerald-600 dark:text-emerald-300' },
];

function Row({ m, onDeleted }: { m: Measurement; onDeleted: () => void }) {
  const { t } = useTranslation('clientMeasurements');
  const deleteMut = useMutation({
    mutationFn: () => clientsApi.deleteMeasurement(m.id),
    onSuccess: () => { toast.success(t('row.deleted')); onDeleted(); },
    onError: (err: Error) => toast.error(err.message ?? t('row.deleteError')),
  });
  return (
    <tr className="border-b border-foreground/[0.04] last:border-0">
      <td className="px-4 py-2 text-[11px] text-foreground/65">
        {new Date(m.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
      </td>
      {FIELDS.map((f) => {
        const v = m[f.key];
        return (
          <td key={f.key} className="px-4 py-2 text-right tabular-nums">
            {v != null ? v.toFixed(1) : <Minus className="ml-auto h-3 w-3 text-foreground/30" />}
          </td>
        );
      })}
      <td className="px-4 py-2 text-right">
        <button
          type="button"
          onClick={() => {
            if (!confirm(t('row.confirmDelete'))) return;
            deleteMut.mutate();
          }}
          disabled={deleteMut.isPending}
          className="text-foreground/45 hover:text-rose-600"
          aria-label={t('common:actions.delete')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function LogDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('clientMeasurements');
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({
    arm_inches: '', chest_inches: '', waist_inches: '', hip_inches: '', thigh_inches: '',
    notes: '',
  });

  const logMut = useMutation({
    mutationFn: () => {
      const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
      const body: Parameters<typeof clientsApi.logMeasurement>[0] = {};
      for (const f of FIELDS) {
        const v = num(form[f.key]);
        if (v !== undefined && Number.isFinite(v)) {
          (body as Record<string, number>)[f.key] = v;
        }
      }
      if (form.notes.trim()) body.notes = form.notes.trim();
      return clientsApi.logMeasurement(body);
    },
    onSuccess: () => {
      toast.success(t('dialog.logged'));
      queryClient.invalidateQueries({ queryKey: ['me', 'measurements'] });
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
        <header className="border-b border-foreground/[0.06] px-5 py-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{t('dialog.eyebrow')}</div>
          <div className="text-base font-semibold">{t('dialog.title')}</div>
        </header>
        <div className="space-y-3 p-5">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <div className="mb-1.5 text-xs font-medium text-foreground/75">{t('dialog.fieldLabel', { label: t(`fields.${f.key}`) })}</div>
              <input
                type="number" step={0.1} inputMode="decimal"
                value={form[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none"
                placeholder={t('dialog.valuePlaceholder')}
              />
            </label>
          ))}
          <label className="block">
            <div className="mb-1.5 text-xs font-medium text-foreground/75">{t('dialog.notesLabel')}</div>
            <input
              type="text" maxLength={500}
              value={form.notes}
              onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none"
              placeholder={t('dialog.notesPlaceholder')}
            />
          </label>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-foreground/[0.06] bg-foreground/[0.02] px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-full px-4 py-1.5 text-sm text-foreground/75 hover:bg-foreground/[0.05]">
            {t('common:actions.cancel')}
          </button>
          <button type="button" onClick={() => logMut.mutate()} disabled={logMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {logMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t('common:actions.save')}
          </button>
        </footer>
      </motion.div>
    </div>
  );
}