import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Pill, Loader2, Plus, Trash2, Check, X, Sunrise, Sun, Sunset, Moon } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type Supplement } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Supplements + medication daily checklist. Each item has a schedule
 * (morning / noon / evening / night / with_meal). Today's "taken" log lives
 * in supplement_logs and is checked client-side from the day's entries.
 */

const SLOTS: Array<{ key: string; label: string; icon: typeof Sunrise }> = [
  { key: 'morning',   label: 'Morning',   icon: Sunrise },
  { key: 'noon',      label: 'Noon',      icon: Sun },
  { key: 'evening',   label: 'Evening',   icon: Sunset },
  { key: 'night',     label: 'Night',     icon: Moon },
  { key: 'with_meal', label: 'With meal', icon: Pill },
];

export default function ClientSupplements() {
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

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">

        <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Daily · Supplements & meds</span>
            <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Tick them off as you go.</h1>
            <p className="mt-2 max-w-2xl text-sm text-foreground/65">
              Add what you take, schedule by time of day, then mark them done. Your nutritionist sees compliance trends.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.55)]"
          >
            <Plus className="h-4 w-4" /> Add supplement
          </button>
        </motion.div>

        {listQ.isLoading ? (
          <motion.div variants={fadeUp}>
            <Glass className="mt-6 flex items-center justify-center p-10 text-sm text-foreground/55">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </Glass>
          </motion.div>
        ) : supplements.length === 0 ? (
          <motion.div variants={fadeUp}>
            <Glass className="mt-6 flex flex-col items-center gap-3 p-10 text-center">
              <Pill className="h-7 w-7 text-foreground/35" />
              <div className="text-sm text-foreground/65">No supplements yet. Add one to start the daily checklist.</div>
            </Glass>
          </motion.div>
        ) : (
          <motion.div variants={fadeUp} className="mt-6 space-y-3">
            {supplements.map((s) => (
              <SupplementRow
                key={s.id}
                supplement={s}
                takenSet={takenSet}
                onEdit={() => setEditing(s)}
                onChanged={() => {
                  queryClient.invalidateQueries({ queryKey: ['me', 'supplements'] });
                  queryClient.invalidateQueries({ queryKey: ['me', 'supplements-today'] });
                }}
              />
            ))}
          </motion.div>
        )}
      </motion.div>

      {(adding || editing) && (
        <EditorDialog
          existing={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
    </ClientLayout>
  );
}

function SupplementRow({ supplement, takenSet, onEdit, onChanged }: {
  supplement: Supplement;
  takenSet: Set<string>;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const takeMut = useMutation({
    mutationFn: (slot?: string) => clientsApi.logSupplementTaken(supplement.id, slot),
    onSuccess: () => { toast.success('Logged.'); onChanged(); },
    onError: (err: Error) => toast.error(err.message ?? 'Could not log.'),
  });
  const removeMut = useMutation({
    mutationFn: () => clientsApi.deactivateSupplement(supplement.id),
    onSuccess: () => { toast.success('Removed.'); onChanged(); },
    onError: (err: Error) => toast.error(err.message ?? 'Could not remove.'),
  });

  const slots = supplement.schedule?.length ? supplement.schedule : [''];

  return (
    <Glass className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Pill className="h-4 w-4 text-violet-600 dark:text-violet-300 flex-shrink-0" />
            <span className="text-sm font-semibold">{supplement.name}</span>
            {supplement.dosage && <span className="text-xs text-foreground/65">· {supplement.dosage}</span>}
          </div>
          {supplement.notes && <div className="mt-1 text-xs text-foreground/65">{supplement.notes}</div>}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onEdit}
            className="rounded-full px-2 py-1 text-[11px] text-foreground/65 hover:bg-foreground/[0.05]">Edit</button>
          <button type="button"
            onClick={() => { if (confirm('Remove this supplement?')) removeMut.mutate(); }}
            className="rounded-full px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-500/10">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
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
              {meta?.label ?? 'Take'}
              {taken && ' ✓'}
            </button>
          );
        })}
      </div>
    </Glass>
  );
}

function EditorDialog({ existing, onClose }: { existing: Supplement | null; onClose: () => void }) {
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
      toast.success(existing ? 'Updated.' : 'Added.');
      queryClient.invalidateQueries({ queryKey: ['me', 'supplements'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not save.'),
  });

  function toggle(key: string) {
    setSchedule((s) => s.includes(key) ? s.filter((x) => x !== key) : [...s, key]);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-foreground/[0.08] bg-popover shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-foreground/[0.06] px-5 py-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Daily routine</div>
            <div className="text-base font-semibold">{existing ? 'Edit supplement' : 'Add supplement'}</div>
          </div>
          <button type="button" onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-foreground/65 hover:bg-foreground/[0.05]"
            aria-label="Close"><X className="h-4 w-4" /></button>
        </header>
        <div className="space-y-4 p-5">
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">Name</div>
            <input type="text" maxLength={120} value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:outline-none"
              placeholder="e.g. Vitamin D3" />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">Dosage (optional)</div>
            <input type="text" maxLength={80} value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:outline-none"
              placeholder="e.g. 60000 IU once weekly" />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">When to take</div>
            <div className="grid grid-cols-2 gap-2">
              {SLOTS.map((s) => {
                const active = schedule.includes(s.key);
                const Icon = s.icon;
                return (
                  <button key={s.key} type="button" onClick={() => toggle(s.key)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors',
                      active
                        ? 'border-violet-400/60 bg-violet-400/10'
                        : 'border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.05]',
                    )}>
                    <Icon className="h-3.5 w-3.5" />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">Notes (optional)</div>
            <input type="text" maxLength={500} value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:outline-none"
              placeholder="Anything to remember" />
          </div>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-foreground/[0.06] bg-foreground/[0.02] px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-full px-4 py-1.5 text-sm text-foreground/75 hover:bg-foreground/[0.05]">Cancel</button>
          <button type="button" onClick={() => save.mutate()}
            disabled={save.isPending || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {existing ? 'Update' : 'Add'}
          </button>
        </footer>
      </motion.div>
    </div>
  );
}