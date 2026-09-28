import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { clientsApi, type BookingHours } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/** Monday first, the way an Indian practice's week reads. 0 = Sunday. */
const WEEK = [
  { d: 1, label: 'Mon' }, { d: 2, label: 'Tue' }, { d: 3, label: 'Wed' }, { d: 4, label: 'Thu' },
  { d: 5, label: 'Fri' }, { d: 6, label: 'Sat' }, { d: 0, label: 'Sun' },
];

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const fieldCls = 'w-full rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm focus:border-teal-400/50 focus:outline-none';

/**
 * When clients can request appointments. The client portal offers only free
 * times inside these hours; nutritionists can still book any time themselves.
 */
export function BookingHoursDialog({ onClose, canEdit }: { onClose: () => void; canEdit: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['workspaces', 'me', 'booking-hours'], queryFn: clientsApi.bookingHours });
  const [h, setH] = useState<BookingHours | null>(null);
  useEffect(() => {
    if (q.data && !h) setH(q.data);
  }, [q.data, h]);

  const save = useMutation({
    mutationFn: (body: BookingHours) => clientsApi.saveBookingHours(body),
    onSuccess: (saved) => {
      qc.setQueryData(['workspaces', 'me', 'booking-hours'], saved);
      toast.success('Booking hours saved.');
      onClose();
    },
    onError: (e) => toast.error((e as Error).message || 'Could not save booking hours.'),
  });

  const set = (patch: Partial<BookingHours>) => setH((cur) => (cur ? { ...cur, ...patch } : cur));
  const hasBreak = h?.breakStart != null && h?.breakEnd != null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-[min(480px,calc(100vw-2rem))]" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="bh-title">
        <Glass variant="heavy" className="max-h-[88vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-foreground/[0.06] p-4">
            <div>
              <h2 id="bh-title" className="text-base font-semibold">Booking hours</h2>
              <p className="text-xs text-foreground/60">Clients can only request free times inside these hours (IST).</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-foreground/65 hover:bg-foreground/[0.05]">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!h ? (
            <div className="flex items-center gap-2 p-6 text-sm text-foreground/60"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : (
            <fieldset disabled={!canEdit || save.isPending} className="space-y-5 p-5">
              <label htmlFor="bh-enabled" className="flex cursor-pointer items-start justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium">Let clients pick from open times</span>
                  <span className="block text-xs text-foreground/60">Off: clients can type any date and time, and you approve each one.</span>
                </span>
                <input id="bh-enabled" type="checkbox" checked={h.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="mt-1 h-4 w-4 accent-emerald-600" />
              </label>

              <div className={cn('space-y-5', !h.enabled && 'pointer-events-none opacity-50')}>
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-foreground/65">Working days</div>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEK.map(({ d, label }) => {
                      const on = h.days.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          onClick={() => set({ days: on ? h.days.filter((x) => x !== d) : [...h.days, d] })}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-xs font-medium',
                            on ? 'border-teal-600 bg-teal-600 text-white' : 'border-foreground/10 text-foreground/65 hover:bg-foreground/[0.04]',
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5" htmlFor="bh-start">
                    <span className="block text-xs font-medium text-foreground/65">Day starts</span>
                    <input id="bh-start" type="time" step={900} value={toTime(h.dayStart)} onChange={(e) => set({ dayStart: toMinutes(e.target.value) })} className={fieldCls} />
                  </label>
                  <label className="space-y-1.5" htmlFor="bh-end">
                    <span className="block text-xs font-medium text-foreground/65">Day ends</span>
                    <input id="bh-end" type="time" step={900} value={toTime(h.dayEnd)} onChange={(e) => set({ dayEnd: toMinutes(e.target.value) })} className={fieldCls} />
                  </label>
                </div>

                <div className="space-y-2">
                  <label htmlFor="bh-break" className="flex items-center gap-2 text-xs font-medium text-foreground/65">
                    <input
                      id="bh-break"
                      type="checkbox"
                      checked={hasBreak}
                      onChange={(e) => set(e.target.checked ? { breakStart: 13 * 60, breakEnd: 14 * 60 } : { breakStart: null, breakEnd: null })}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    Lunch break
                  </label>
                  {hasBreak && (
                    <div className="grid grid-cols-2 gap-3">
                      <input aria-label="Break starts" type="time" step={900} value={toTime(h.breakStart!)} onChange={(e) => set({ breakStart: toMinutes(e.target.value) })} className={fieldCls} />
                      <input aria-label="Break ends" type="time" step={900} value={toTime(h.breakEnd!)} onChange={(e) => set({ breakEnd: toMinutes(e.target.value) })} className={fieldCls} />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Choice id="bh-step" label="Start times every" value={h.stepMinutes} options={[[15, '15 min'], [30, '30 min'], [60, '1 hour']]} onChange={(v) => set({ stepMinutes: v })} />
                  <Choice id="bh-buffer" label="Gap between sessions" value={h.bufferMinutes} options={[[0, 'None'], [10, '10 min'], [15, '15 min'], [30, '30 min']]} onChange={(v) => set({ bufferMinutes: v })} />
                  <Choice id="bh-notice" label="Minimum notice" value={h.minNoticeHours} options={[[1, '1 hour'], [2, '2 hours'], [4, '4 hours'], [12, '12 hours'], [24, '1 day']]} onChange={(v) => set({ minNoticeHours: v })} />
                  <Choice id="bh-horizon" label="Clients can book up to" value={h.horizonDays} options={[[7, '1 week ahead'], [14, '2 weeks ahead'], [30, '30 days ahead']]} onChange={(v) => set({ horizonDays: v })} />
                </div>
              </div>
            </fieldset>
          )}

          <div className="flex gap-2 border-t border-foreground/[0.06] p-4">
            <button type="button" onClick={onClose} className="flex-1 rounded-full border border-foreground/10 px-4 py-2.5 text-sm font-medium hover:bg-foreground/[0.04]">
              {canEdit ? 'Cancel' : 'Close'}
            </button>
            {canEdit && (
              <button
                type="button"
                disabled={!h || save.isPending}
                onClick={() => h && save.mutate(h)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save hours
              </button>
            )}
          </div>
        </Glass>
      </div>
    </div>
  );
}

function Choice({ id, label, value, options, onChange }: {
  id: string;
  label: string;
  value: number;
  options: Array<[number, string]>;
  onChange: (v: number) => void;
}) {
  // Keep a saved value that isn't one of the presets selectable.
  const opts = options.some(([v]) => v === value) ? options : [...options, [value, `${value}`] as [number, string]];
  return (
    <label className="space-y-1.5" htmlFor={id}>
      <span className="block text-xs font-medium text-foreground/65">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} className={fieldCls}>
        {opts.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
}
