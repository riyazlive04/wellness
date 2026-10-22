import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Loader2, Mail, Send } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { ApiError } from '@/lib/api';
import { adminApi } from '@/modules/super-admin/api/admin';
import { cn } from '@/lib/utils';

/** The job warns at these buckets, then once more on the day it lapses. */
const BUCKETS = [7, 3, 1, 0];

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Has this practice actually been reminded, and can I remind them now?
 *
 * The reminders go out at 9am IST on fixed day buckets, so a practice can sit
 * for days between warnings — Aboothahir had nothing due between day 3 and
 * day 1. Without this panel, answering "did they hear from us?" meant reading
 * the database.
 */
export function RemindersCard({ workspaceId, daysLeft }: { workspaceId: string; daysLeft: number | null }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'trial-reminders', workspaceId],
    queryFn: () => adminApi.trialReminders(workspaceId),
  });

  const send = useMutation({
    mutationFn: () => adminApi.sendTrialReminder(workspaceId),
    onSuccess: (r) => {
      if (r.sent) {
        const via = [r.email && 'email', r.whatsapp && 'WhatsApp'].filter(Boolean).join(' and ');
        toast.success(`Reminder sent by ${via}.`);
      } else {
        toast.error(r.reason ?? 'Nothing was sent.');
      }
      qc.invalidateQueries({ queryKey: ['admin', 'trial-reminders', workspaceId] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not send the reminder.'),
  });

  const rows = q.data ?? [];
  // What the schedule will do next, so the manual button is a considered
  // choice rather than a guess.
  const nextBucket = daysLeft === null ? null : BUCKETS.find((b) => b < daysLeft) ?? null;
  const dueToday = daysLeft !== null && BUCKETS.includes(daysLeft)
    && !rows.some((r) => r.days_bucket === daysLeft);

  return (
    <Glass className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-foreground/[0.06] px-5 py-3">
        <Bell className="h-3.5 w-3.5 text-teal-700 dark:text-teal-300" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
          Trial reminders
        </span>
        <button
          type="button"
          onClick={() => send.mutate()}
          disabled={send.isPending}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-teal-50 transition-colors hover:bg-teal-800 disabled:opacity-50"
        >
          {send.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Send now
        </button>
      </div>

      <div className="border-b border-foreground/[0.06] px-5 py-2.5 text-[12px] text-foreground/65">
        {daysLeft === null ? 'No trial date set.'
          : daysLeft < 0 ? 'Trial has ended — no further reminders are scheduled.'
          : dueToday ? <span className="text-amber-700 dark:text-amber-300">Due today at 9am and not yet sent.</span>
          : nextBucket !== null
            ? <>Next automatic reminder at <b>{nextBucket} day{nextBucket === 1 ? '' : 's'} left</b>
                {' '}— in {daysLeft - nextBucket} day{daysLeft - nextBucket === 1 ? '' : 's'}, 9am IST.</>
            : 'No further reminders scheduled before the trial ends.'}
      </div>

      {q.isLoading ? (
        <div className="grid place-items-center py-8"><Loader2 className="h-4 w-4 animate-spin text-foreground/40" /></div>
      ) : rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-foreground/55">
          Nothing sent yet.
        </p>
      ) : (
        <ul className="divide-y divide-foreground/[0.04]">
          {rows.map((r, i) => (
            <li key={`${r.sent_at}-${i}`} className="flex items-center gap-3 px-5 py-2.5">
              <Mail className={cn('h-3.5 w-3.5 flex-shrink-0',
                r.source.includes('email') ? 'text-teal-600' : 'text-foreground/30')} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px]">{r.title}</div>
                <div className="text-[11px] text-foreground/55">{when(r.sent_at)} · {r.source}</div>
              </div>
              {r.days_bucket !== null && (
                <span className="flex-shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10.5px] font-semibold text-foreground/65">
                  {r.days_bucket}d
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Glass>
  );
}
