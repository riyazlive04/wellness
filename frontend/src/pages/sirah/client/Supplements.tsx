import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Pill, Loader2, Plus, Trash2, Check, X, Sunrise, Sun, Sunset, Moon, CheckCircle2, ListChecks, TrendingUp, Utensils, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type Supplement } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Supplements + medication daily checklist. Each item has a schedule
 * (morning / noon / evening / night / with_meal). Today's "taken" log lives
 * in supplement_logs and is checked client-side from the day's entries.
 */

const SLOTS: Array<{ key: string; labelKey: string; icon: typeof Sunrise }> = [
  { key: 'morning',     labelKey: 'slots.morning',     icon: Sunrise },
  { key: 'noon',        labelKey: 'slots.noon',        icon: Sun },
  { key: 'evening',     labelKey: 'slots.evening',     icon: Sunset },
  { key: 'night',       labelKey: 'slots.night',       icon: Moon },
  { key: 'before_food', labelKey: 'slots.before_food', icon: Utensils },
  { key: 'after_food',  labelKey: 'slots.after_food',  icon: UtensilsCrossed },
  { key: 'with_meal',   labelKey: 'slots.with_meal',   icon: Pill },
];

export default function ClientSupplements() {
  const { t } = useTranslation('clientSupplements');
  const queryClient = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const listQ = useQuery({ queryKey: ['me', 'supplements'], queryFn: () => clientsApi.mySupplements(), retry: 1 });
  const todayQ = useQuery({ queryKey: ['me', 'supplements-today'], queryFn: () => clientsApi.todaysSupplementLog(), retry: 1 });

  const supplements = listQ.data ?? [];
  const todayLog = todayQ.data ?? [];

  // Quick lookup: "is supplement X taken for slot Y today?"
  const takenSet = useMemo(() => {
    const s = new Set<string>();
    for (const l of todayLog) s.add(`${l.supplement_id}|${l.slot ?? ''}`);
    return s;
  }, [todayLog]);

  const [editing, setEditing] = useState<Supplement | null>(null);
  const [adding, setAdding] = useState(false);

  // Adherence: total scheduled "doses" today vs. how many are ticked off.
  const { totalDoses, takenDoses } = useMemo(() => {
    let total = 0;
    let taken = 0;
    for (const s of supplements) {
      const slots = s.schedule?.length ? s.schedule : [''];
      for (const slot of slots) {
        total += 1;
        if (takenSet.has(`${s.id}|${slot}`)) taken += 1;
      }
    }
    return { totalDoses: total, takenDoses: taken };
  }, [supplements, takenSet]);

  const adherence = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 0;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['me', 'supplements'] });
    queryClient.invalidateQueries({ queryKey: ['me', 'supplements-today'] });
  };

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <div className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 md:px-8 md:py-10">
        <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-7">

          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-teal-600 dark:text-teal-300">
                <Pill className="h-4 w-4" />
                <span className="text-xs uppercase tracking-[0.18em]">{t('eyebrow')}</span>
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">{t('title')}</h1>
              <p className="mt-1.5 max-w-2xl text-sm text-foreground/60">
                {t('subtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="group inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(14,154,168,0.55)] transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
            >
              <Plus className="h-4 w-4" /> {t('addButton')}
            </button>
          </motion.div>

          {/* Stat strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile icon={ListChecks} label={t('stats.supplements')} value={String(supplements.length)} tint="text-teal-600 dark:text-teal-300" />
            <StatTile icon={CheckCircle2} label={t('stats.takenToday')} value={`${takenDoses}/${totalDoses}`} tint="text-emerald-600 dark:text-emerald-300" />
            <StatTile
              icon={TrendingUp}
              label={t('stats.adherence')}
              value={`${adherence}%`}
              tint="text-blue-600 dark:text-blue-300"
              progress={adherence / 100}
            />
          </motion.div>

          {/* Supplement grid */}
          {listQ.isLoading ? (
            <motion.div variants={fadeUp}>
              <Glass className="flex items-center justify-center p-16 text-sm text-foreground/55">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('common:status.loading')}
              </Glass>
            </motion.div>
          ) : supplements.length === 0 ? (
            <motion.div variants={fadeUp}>
              <Glass className="flex flex-col items-center gap-3 p-16 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-300">
                  <Pill className="h-6 w-6" />
                </div>
                <div className="text-sm font-medium text-foreground/80">{t('empty.title')}</div>
                <div className="max-w-xs text-xs text-foreground/55">{t('empty.description')}</div>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-sm font-medium text-white"
                >
                  <Plus className="h-4 w-4" /> {t('empty.cta')}
                </button>
              </Glass>
            </motion.div>
          ) : (
            <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {supplements.map((s) => (
                <SupplementRow
                  key={s.id}
                  supplement={s}
                  takenSet={takenSet}
                  onEdit={() => setEditing(s)}
                  onChanged={invalidate}
                />
              ))}
            </motion.div>
          )}
        </motion.div>
      </div>

      {(adding || editing) && (
        <EditorDialog
          existing={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
    </ClientLayout>
  );
}

function StatTile({ icon: Icon, label, value, tint, progress }: {
  icon: typeof Pill;
  label: string;
  value: string;
  tint: string;
  progress?: number;
}) {
  return (
    <Glass className="p-4">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-3.5 w-3.5', tint)} strokeWidth={1.8} />
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {progress !== undefined && (
        <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-foreground/[0.05]">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      )}
    </Glass>
  );
}

function SupplementRow({ supplement, takenSet, onEdit, onChanged }: {
  supplement: Supplement;
  takenSet: Set<string>;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation('clientSupplements');
  const takeMut = useMutation({
    mutationFn: (slot?: string) => clientsApi.logSupplementTaken(supplement.id, slot),
    onSuccess: () => { toast.success(t('toast.logged')); onChanged(); },
    onError: (err: Error) => toast.error(err.message ?? t('toast.logError')),
  });
  const removeMut = useMutation({
    mutationFn: () => clientsApi.deactivateSupplement(supplement.id),
    onSuccess: () => { toast.success(t('toast.removed')); onChanged(); },
    onError: (err: Error) => toast.error(err.message ?? t('toast.removeError')),
  });

  const slots = supplement.schedule?.length ? supplement.schedule : [''];
  const takenCount = slots.filter((slot) => takenSet.has(`${supplement.id}|${slot}`)).length;
  const allTaken = takenCount === slots.length;

  return (
    <Glass className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-300">
            <Pill className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{supplement.name}</div>
            {supplement.dosage && <div className="mt-0.5 truncate text-xs text-foreground/65">{supplement.dosage}</div>}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button type="button" onClick={onEdit}
            className="rounded-full px-2 py-1 text-[11px] text-foreground/65 hover:bg-foreground/[0.05]">{t('common:actions.edit')}</button>
          <button type="button"
            aria-label={t('card.deleteAriaLabel')}
            onClick={() => { if (confirm(t('card.confirmRemove'))) removeMut.mutate(); }}
            className="rounded-full px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-500/10">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {supplement.notes && <div className="mt-2 line-clamp-2 text-xs text-foreground/65">{supplement.notes}</div>}

      <div className="mt-3 flex items-center gap-2">
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em]',
          allTaken
            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200'
            : 'bg-foreground/[0.05] text-foreground/55',
        )}>
          {allTaken && <Check className="h-3 w-3" />}
          {t('card.takenSummary', { taken: takenCount, total: slots.length })}
        </span>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {slots.map((slot) => {
          const meta = SLOTS.find((s) => s.key === slot) ?? null;
          const taken = takenSet.has(`${supplement.id}|${slot}`);
          const Icon = meta?.icon ?? Pill;
          return (
            <button
              key={slot || 'default'}
              type="button"
              onClick={() => takeMut.mutate(slot || undefined)}
              disabled={takeMut.isPending || taken}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors',
                taken
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200'
                  : 'border border-foreground/15 text-foreground/75 hover:bg-foreground/[0.05]',
              )}
            >
              {taken ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
              {meta ? t(meta.labelKey) : t('slots.take')}
              {taken && ' ✓'}
            </button>
          );
        })}
      </div>
    </Glass>
  );
}

function EditorDialog({ existing, onClose }: { existing: Supplement | null; onClose: () => void }) {
  const { t } = useTranslation('clientSupplements');
  const queryClient = useQueryClient();
  const [name, setName]       = useState(existing?.name ?? '');
  const [dosage, setDosage]   = useState(existing?.dosage ?? '');
  const [schedule, setSchedule] = useState<string[]>(existing?.schedule ?? ['morning']);
  const [notes, setNotes]     = useState(existing?.notes ?? '');

  const save = useMutation({
    mutationFn: () => clientsApi.upsertSupplement({
      id: existing?.id,
      name: name.trim(),
      dosage: dosage.trim() || undefined,
      schedule,
      notes: notes.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success(existing ? t('toast.updated') : t('toast.added'));
      queryClient.invalidateQueries({ queryKey: ['me', 'supplements'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message ?? t('toast.saveError')),
  });

  function toggle(key: string) {
    setSchedule((s) => s.includes(key) ? s.filter((x) => x !== key) : [...s, key]);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 " onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-foreground/[0.08] bg-popover shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-foreground/[0.06] px-5 py-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{t('editor.eyebrow')}</div>
            <div className="text-base font-semibold">{existing ? t('editor.editTitle') : t('editor.addTitle')}</div>
          </div>
          <button type="button" onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-foreground/65 hover:bg-foreground/[0.05]"
            aria-label={t('common:actions.close')}><X className="h-4 w-4" /></button>
        </header>
        <div className="space-y-4 p-5">
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">{t('editor.nameLabel')}</div>
            <input type="text" maxLength={120} value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none"
              placeholder={t('editor.namePlaceholder')} />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">{t('editor.dosageLabel')}</div>
            <input type="text" maxLength={80} value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none"
              placeholder={t('editor.dosagePlaceholder')} />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">{t('editor.whenLabel')}</div>
            <div className="grid grid-cols-2 gap-2">
              {SLOTS.map((s) => {
                const active = schedule.includes(s.key);
                const Icon = s.icon;
                return (
                  <button key={s.key} type="button" onClick={() => toggle(s.key)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors',
                      active
                        ? 'border-teal-400/60 bg-teal-400/10'
                        : 'border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.05]',
                    )}>
                    <Icon className="h-3.5 w-3.5" />
                    {t(s.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">{t('editor.notesLabel')}</div>
            <input type="text" maxLength={500} value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none"
              placeholder={t('editor.notesPlaceholder')} />
          </div>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-foreground/[0.06] bg-foreground/[0.02] px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-full px-4 py-1.5 text-sm text-foreground/75 hover:bg-foreground/[0.05]">{t('common:actions.cancel')}</button>
          <button type="button" onClick={() => save.mutate()}
            disabled={save.isPending || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {existing ? t('common:actions.update') : t('common:actions.add')}
          </button>
        </footer>
      </motion.div>
    </div>
  );
}