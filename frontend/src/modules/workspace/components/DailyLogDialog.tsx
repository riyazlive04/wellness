import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { clientsApi, type AssessmentForm, type ClientListItem } from '@/modules/workspace/api/clients';

/** Every half hour; most practices nudge in the evening. */
const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  return `${h}:${i % 2 ? '30' : '00'}`;
});
const pretty = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  const ampm = h < 12 ? 'am' : 'pm';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ampm}`;
};

/**
 * Turn a form into a daily log: pick who fills it in each day and when to
 * remind them. Unlike Send, which gives a client one card to fill in once,
 * this reopens the form every morning and charts the numbers over time.
 */
export function DailyLogDialog({ form, onClose }: { form: AssessmentForm; onClose: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(form.assigned_client_ids ?? []));
  const [remind, setRemind] = useState<boolean>(!!form.reminder_time);
  const [time, setTime] = useState<string>(form.reminder_time ?? '20:00');

  const clientsQ = useQuery({
    queryKey: ['clients', 'for-daily-log'],
    queryFn: () => clientsApi.list({ limit: 200 }),
  });
  const clients: ClientListItem[] = clientsQ.data?.items ?? [];
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter(
      (c) => (c.name ?? '').toLowerCase().includes(term) || (c.email ?? '').toLowerCase().includes(term),
    );
  }, [clients, q]);

  const fieldCount = form.questions.filter((x) => x.type !== 'section').length;

  const save = useMutation({
    mutationFn: () =>
      clientsApi.setFormDaily(form.id, {
        repeatDaily: selected.size > 0,
        reminderTime: remind && selected.size > 0 ? time : null,
        clientIds: [...selected],
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['assessment-forms'] });
      toast.success(
        r.assigned === 0
          ? 'Daily log switched off.'
          : `Daily log on for ${r.assigned} client${r.assigned === 1 ? '' : 's'}.`,
      );
      onClose();
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#0c1f08]/45 p-4 backdrop-blur-[3px]" role="dialog" aria-modal="true">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[26px] bg-card shadow-[0_30px_80px_-20px_rgba(12,31,8,0.45)]">
        <div className="relative bg-[#123a0b] px-6 pb-5 pt-5 text-[#eaf6dc]">
          <button type="button" onClick={onClose} aria-label="Close"
            className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/10 transition hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#b5d99a]">
            <CalendarClock className="h-3.5 w-3.5" /> Daily log
          </span>
          <h2 className="mt-1.5 text-[19px] font-bold tracking-tight">{form.name}</h2>
          <p className="mt-1 text-sm text-[#cfe6bb]">
            {fieldCount} question{fieldCount === 1 ? '' : 's'}, filled in every day. Their answers chart over time.
          </p>
        </div>

        <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-6 py-5">
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-foreground/45">Who fills it in</span>
              {selected.size > 0 && (
                <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-semibold text-foreground/50 hover:underline">
                  Clear
                </button>
              )}
            </div>
            <label className="mb-2 flex h-9 items-center gap-2 rounded-lg border border-foreground/10 bg-background px-2.5">
              <Search className="h-4 w-4 shrink-0 text-foreground/40" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/40" />
            </label>
            {clientsQ.isLoading ? (
              <div className="grid place-items-center py-8"><Loader2 className="h-5 w-5 animate-spin text-foreground/40" /></div>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-foreground/50">No clients found.</p>
            ) : (
              <ul className="max-h-56 overflow-y-auto rounded-xl border border-foreground/[0.07]">
                {filtered.map((c) => {
                  const on = selected.has(c.id);
                  return (
                    <li key={c.id} className="border-b border-foreground/[0.05] last:border-0">
                      <button type="button" onClick={() => toggle(c.id)} aria-pressed={on}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-foreground/[0.03]">
                        <span className={cn('grid h-4.5 w-4.5 shrink-0 place-items-center rounded-[5px] border',
                          on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-foreground/25')}
                          style={{ height: 18, width: 18 }}>
                          {on && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <b className="block truncate text-sm font-semibold">{c.name ?? 'Unnamed client'}</b>
                          {c.email && <span className="block truncate text-xs text-foreground/50">{c.email}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="grid gap-2.5 rounded-xl bg-foreground/[0.03] p-3.5">
            <label className="flex items-center gap-2.5 text-sm font-semibold">
              <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)}
                className="h-4 w-4 accent-emerald-600" />
              Remind them each day
            </label>
            {remind && (
              <select value={time} onChange={(e) => setTime(e.target.value)}
                className="h-9 w-full rounded-lg border border-foreground/10 bg-background px-2.5 text-sm outline-none">
                {TIMES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
              </select>
            )}
            <p className="text-xs leading-relaxed text-foreground/55">
              A log lasts the day. Whatever they don&apos;t fill in stays blank — a partly filled log is still useful.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-foreground/[0.07] px-6 py-4">
          <span className="text-sm text-foreground/60">
            {selected.size === 0 ? 'Nobody selected — this switches the daily log off.' : `${selected.size} client${selected.size === 1 ? '' : 's'}`}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-foreground/70 hover:bg-foreground/[0.05]">
              Cancel
            </button>
            <button type="button" onClick={() => save.mutate()} disabled={save.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#123a0b] px-5 py-2 text-sm font-bold text-[#eaf6dc] transition hover:bg-[#1b4f12] disabled:opacity-50">
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
