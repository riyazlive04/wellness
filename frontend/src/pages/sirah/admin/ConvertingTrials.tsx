import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Loader2 } from 'lucide-react';

import { Glass } from '@/design-system';
import { adminApi } from '@/modules/super-admin/api/admin';
import { cn } from '@/lib/utils';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const PLAN: Record<string, string> = { starter: 'Starter', growth: 'Growth', scale_pro: 'Scale Pro' };

const date = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** Warnings fire at 7, 3 and 1 days, then on the day it lapses. */
const WARN_DAYS = [7, 3, 1, 0];

/**
 * When does this practice next hear from us, and what will it say?
 *
 * The reminder job runs at 9am IST and only acts on the exact buckets, so
 * "2 days left" means nothing fires today — knowing that is the difference
 * between leaving it to the system and picking up the phone.
 */
function nextReminder(daysLeft: number, lastWarned: number | null): string {
  if (daysLeft < 0) return 'Trial ended · no further reminders';
  const next = WARN_DAYS.find((d) => d < daysLeft || (d === daysLeft && lastWarned !== d));
  if (next === undefined) return 'No reminder due';
  if (next === daysLeft) return 'Reminder due today, 9am';
  const inDays = daysLeft - next;
  if (next === 0) return `Lapse notice ${inDays === 1 ? 'tomorrow' : `in ${inDays} days`}, 9am`;
  return `${next}-day warning ${inDays === 1 ? 'tomorrow' : `in ${inDays} days`}, 9am`;
}

/**
 * The practices that will become subscriptions next — or lapse.
 *
 * The subscriptions table only shows what has already happened; this is the
 * pipeline in front of it, which is where the attention actually belongs.
 */
export function ConvertingTrials() {
  const q = useQuery({ queryKey: ['admin', 'trials', 'converting'], queryFn: adminApi.convertingTrials });
  const rows = q.data ?? [];
  if (q.isLoading) {
    return (
      <Glass className="grid place-items-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </Glass>
    );
  }
  if (q.isError || rows.length === 0) return null;

  const ending = rows.filter((r) => r.days_left >= 0);
  const lapsed = rows.filter((r) => r.days_left < 0);

  return (
    <Glass className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-foreground/[0.06] px-5 py-3">
        <CalendarClock className="h-3.5 w-3.5 text-teal-700 dark:text-teal-300" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
          Coming up · trials
        </span>
        <span className="ml-auto text-[11.5px] text-foreground/55">
          {ending.length} ending{lapsed.length > 0 ? ` · ${lapsed.length} lapsed` : ''}
        </span>
      </div>

      <ul className="divide-y divide-foreground/[0.04]">
        {rows.map((r) => {
          const urgent = r.days_left >= 0 && r.days_left <= 3;
          const over = r.days_left < 0;
          return (
            <li key={r.workspace_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
              <div className="min-w-0 flex-1">
                <Link to={`/admin/workspaces/${r.workspace_id}`} className="truncate text-sm font-medium hover:underline">
                  {r.name}
                </Link>
                <div className="truncate text-[11.5px] text-foreground/55">
                  {r.owner_email ?? 'no email on file'}
                  {r.plan_key ? ` · chose ${PLAN[r.plan_key] ?? r.plan_key}` : ' · no plan chosen yet'}
                </div>
              </div>

              <div className="text-right">
                <div className={cn(
                  'text-sm font-semibold tabular-nums',
                  over ? 'text-rose-700 dark:text-rose-300'
                    : urgent ? 'text-amber-700 dark:text-amber-300'
                    : 'text-foreground',
                )}>
                  {over ? `${Math.abs(r.days_left)}d over` : `${r.days_left}d left`}
                </div>
                <div className="text-[11px] text-foreground/55">
                  {over ? 'ended' : 'ends'} {date(r.trial_ends_at)}
                </div>
              </div>

              <div className="w-[136px] text-right">
                <div className="text-sm font-semibold tabular-nums">
                  {r.next_charge_inr != null ? INR.format(r.next_charge_inr) : '—'}
                </div>
                <div className="text-[11px] text-foreground/55">
                  {r.next_charge_inr != null ? 'setup fee paid' : 'no plan yet'}
                </div>
              </div>

              <div className="w-full text-[11.5px] text-foreground/55 sm:w-[210px] sm:text-right">
                {nextReminder(r.days_left, r.last_warned_days)}
              </div>
            </li>
          );
        })}
      </ul>
    </Glass>
  );
}
