import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Ruler, Plus, Loader2, Trash2, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { toast } from 'sonner';

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

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">

        <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Body · Measurements</span>
            <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Inches lost over time.</h1>
            <p className="mt-2 max-w-2xl text-sm text-foreground/65">
              Weight moves slowly. Inches move first. Log every couple of weeks to see the real picture.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.55)]"
          >
            <Plus className="h-4 w-4" /> Log measurement
          </button>
        </motion.div>

        {/* Latest snapshot grid */}
        {latest ? (
          <motion.div variants={fadeUp} className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {FIELDS.map((f) => {
              const cur = latest[f.key];
              const prev = previous?.[f.key];
              const delta = cur != null && prev != null ? +(cur - prev).toFixed(2) : null;
              return (
                <Glass key={f.key} className="p-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{f.label}</div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-2xl font-semibold">
                      {cur != null ? cur.toFixed(1) : '—'}
                    </span>
                    {cur != null && <span className="text-xs text-foreground/55">in</span>}
                  </div>
                  {delta != null && delta !== 0 && (
                    <div className={cn(
                      'mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]',
                      delta < 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                 : 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
                    )}>
                      {delta < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                      {delta > 0 ? '+' : ''}{delta.toFixed(1)} from last
                    </div>
                  )}
                  {totalChange && totalChange[f.key.replace('_inches', '') as keyof typeof totalChange] != null && (
                    <div className="mt-1 text-[10px] text-foreground/55">
                      Total: {(totalChange[f.key.replace('_inches', '') as keyof typeof totalChange] as number) > 0 ? '+' : ''}{(totalChange[f.key.replace('_inches', '') as keyof typeof totalChange] as number).toFixed(1)} in
                    </div>
                  )}
                </Glass>
              );
            })}
          </motion.div>
        ) : (
          <motion.div variants={fadeUp}>
            <Glass className="mt-6 flex flex-col items-center gap-3 p-10 text-center">
              <Ruler className="h-7 w-7 text-foreground/35" />
              <div className="text-sm text-foreground/65">No measurements yet. Log your first one to set a baseline.</div>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white"
              >
                <Plus className="h-4 w-4" /> Add baseline
              </button>
            </Glass>
          </motion.div>
        )}

        {/* History */}
        {list.length > 0 && (
          <motion.div variants={fadeUp} className="mt-8">
            <h2 className="mb-3 text-base font-semibold">History</h2>
            <Glass className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-foreground/[0.06] bg-foreground/[0.02] text-[10px] uppercase tracking-[0.16em] text-foreground/55">
                    <tr>
                      <th className="px-4 py-2 text-left">When</th>
                      {FIELDS.map((f) => (
                        <th key={f.key} className="px-4 py-2 text-right">{f.label}</th>
                      ))}
                      <th className="px-4 py-2 text-right" />
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
      </motion.div>

      {open && <LogDialog onClose={() => setOpen(false)} />}
    </ClientLayout>
  );
}

function Row({ m, onDeleted }: { m: Measurement; onDeleted: () => void }) {
  const deleteMut = useMutation({
    mutationFn: () => clientsApi.deleteMeasurement(m.id),
    onSuccess: () => { toast.success('Deleted.'); onDeleted(); },
    onError: (err: Error) => toast.error(err.message ?? 'Could not delete.'),
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
            if (!confirm('Delete this entry?')) return;
            deleteMut.mutate();
          }}
          disabled={deleteMut.isPending}
          className="text-foreground/45 hover:text-rose-600"
          aria-label="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function LogDialog({ onClose }: { onClose: () => void }) {
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
      toast.success('Logged.');
      queryClient.invalidateQueries({ queryKey: ['me', 'measurements'] });
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
        <header className="border-b border-foreground/[0.06] px-5 py-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">New entry</div>
          <div className="text-base font-semibold">Log measurement</div>
        </header>
        <div className="space-y-3 p-5">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <div className="mb-1.5 text-xs font-medium text-foreground/75">{f.label} (inches)</div>
              <input
                type="number" step={0.1} inputMode="decimal"
                value={form[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:outline-none"
                placeholder="e.g. 32.5"
              />
            </label>
          ))}
          <label className="block">
            <div className="mb-1.5 text-xs font-medium text-foreground/75">Notes (optional)</div>
            <input
              type="text" maxLength={500}
              value={form.notes}
              onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:outline-none"
              placeholder="Morning, post-workout, etc."
            />
          </label>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-foreground/[0.06] bg-foreground/[0.02] px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-full px-4 py-1.5 text-sm text-foreground/75 hover:bg-foreground/[0.05]">
            Cancel
          </button>
          <button type="button" onClick={() => logMut.mutate()} disabled={logMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {logMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </footer>
      </motion.div>
    </div>
  );
}