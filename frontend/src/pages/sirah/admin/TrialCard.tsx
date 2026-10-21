import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { ApiError } from '@/lib/api';
import { adminApi } from '@/modules/super-admin/api/admin';
import { cn } from '@/lib/utils';

const QUICK = [7, 14, 30] as const;
const field = 'h-9 w-full rounded-lg border border-foreground/10 bg-background px-2.5 text-sm outline-none focus:border-foreground/30';
const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Extending one practice's trial. Until now the only way to move a trial date
 * was to edit the database by hand.
 *
 * Days are counted from today rather than from the old end date, so "+7 days"
 * always means seven usable days — including for a trial that already lapsed,
 * which is the case where this is most often needed.
 */
export function TrialCard({
  workspaceId,
  trialEndsAt,
  onTrial,
}: {
  workspaceId: string;
  trialEndsAt: string | null;
  onTrial: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState('14');
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');

  const extend = useMutation({
    mutationFn: () =>
      adminApi.extendTrial(workspaceId, {
        ...(until ? { until } : { days: Math.round(Number(days)) }),
        reason: reason.trim() || undefined,
      }),
    onSuccess: (res) => {
      toast.success(`Trial now ends ${fmt(res.data.trial_ends_at)}.`);
      setOpen(false);
      setUntil('');
      setReason('');
      qc.invalidateQueries({ queryKey: ['admin', 'workspace', workspaceId] });
      qc.invalidateQueries({ queryKey: ['admin', 'workspaces'] });
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
      qc.invalidateQueries({ queryKey: ['admin', 'platform-stats'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not extend the trial.'),
  });

  const daysLeft = trialEndsAt
    ? Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000)
    : null;
  const expired = daysLeft !== null && daysLeft <= 0;
  const valid = until ? /^\d{4}-\d{2}-\d{2}$/.test(until) : Number(days) >= 1 && Number(days) <= 365;
  // A past date is allowed — it is how you undo an extension or end a trial
  // early — but it locks the practice out at once, so say so plainly.
  const pastDate = !!until && /^\d{4}-\d{2}-\d{2}$/.test(until) && until < new Date().toLocaleDateString('en-CA');

  return (
    <Glass className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
            Trial
          </div>
          <p className="mt-1 text-sm text-foreground/70">
            {!trialEndsAt ? (
              'No trial date set.'
            ) : !onTrial ? (
              <>On a paid plan. The trial ended {fmt(trialEndsAt)}.</>
            ) : expired ? (
              <span className="text-rose-700 dark:text-rose-300">
                Trial ended {fmt(trialEndsAt)} — this practice is locked out right now.
              </span>
            ) : (
              <>
                Ends {fmt(trialEndsAt)}
                <span className={cn('ml-1.5 tabular-nums', daysLeft! <= 3 && 'text-amber-700 dark:text-amber-300')}>
                  ({daysLeft} {daysLeft === 1 ? 'day' : 'days'} left)
                </span>
              </>
            )}
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#123a0b] px-3.5 py-1.5 text-xs font-semibold text-[#eaf6dc] hover:bg-[#1b4f12]"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            {expired ? 'Reopen trial' : 'Extend trial'}
          </button>
        )}
      </div>

      {open && (
        <form
          className="grid gap-3 rounded-xl bg-foreground/[0.03] p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) extend.mutate();
          }}
        >
          <div className="grid gap-1.5 sm:col-span-2">
            <span className="text-xs font-medium">Add time</span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDays(String(d));
                    setUntil('');
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                    !until && Number(days) === d
                      ? 'border-transparent bg-[#123a0b] text-[#eaf6dc]'
                      : 'border-foreground/10 text-foreground/75 hover:bg-foreground/[0.05]',
                  )}
                >
                  +{d} days
                </button>
              ))}
            </div>
          </div>

          <label className={cn('grid gap-1 text-xs font-medium', until && 'opacity-45')}>
            Days from today {until && <span className="font-normal">(ignored — a date is set)</span>}
            <input
              className={field}
              inputMode="numeric"
              value={until ? '' : days}
              disabled={!!until}
              onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            …or end on a date
            <input
              type="date"
              className={field}
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium sm:col-span-2">
            Reason (optional — kept in the audit log)
            <input
              className={field}
              maxLength={200}
              placeholder="Still importing their clients…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>

          <p className="text-xs leading-relaxed text-foreground/60 sm:col-span-2">
            {until ? (
              pastDate ? (
                <span className="text-amber-700 dark:text-amber-300">
                  {fmt(`${until}T12:00:00`)} is in the past, so this locks the practice out straight away.
                  Use it to correct a date, not to give time.
                </span>
              ) : (
                <>The trial will end on {/^\d{4}-\d{2}-\d{2}$/.test(until) ? fmt(`${until}T12:00:00`) : 'the date you pick'}, end of day.</>
              )
            ) : (
              <>Counted from today, so they get the full {days || '0'} days even if the trial has already ended.</>
            )}
            {' '}They are told by email and WhatsApp again as the new date approaches.
          </p>

          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-foreground/70 hover:bg-foreground/[0.05]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || extend.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#123a0b] px-3.5 py-1.5 text-xs font-semibold text-[#eaf6dc] hover:bg-[#1b4f12] disabled:opacity-50"
            >
              {extend.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {expired ? 'Reopen trial' : 'Extend trial'}
            </button>
          </div>
        </form>
      )}
    </Glass>
  );
}
