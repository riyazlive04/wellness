import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell, Check, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ApiError } from '@/lib/api';
import { adminApi } from '@/modules/super-admin/api/admin';
import { cn } from '@/lib/utils';
import { TRIAL_WARN_BUCKETS, TRIAL_WARN_TIME } from '@/modules/super-admin/trialSchedule';
import { AdminHeader } from './AdminHeader';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const PLAN: Record<string, string> = { starter: 'Starter', growth: 'Growth', scale_pro: 'Scale Pro' };

/** Shared with the backend's TRIAL_WARN_DAYS — see trialSchedule.ts. */
const BUCKETS = TRIAL_WARN_BUCKETS as readonly number[];

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const day = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

type Row = Awaited<ReturnType<typeof adminApi.reminderBoard>>[number];

/** Did this channel carry the message? Greyed when it did not. */
function ChannelChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      title={on ? `${label}: sent` : `${label}: not sent`}
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
        on ? 'bg-teal-500/15 text-teal-800 dark:text-teal-200'
           : 'bg-foreground/[0.05] text-foreground/40 line-through',
      )}
    >
      {label}
    </span>
  );
}

/** Disabled when the practice has no address for that channel. */
function SendButton({ label, onClick, busy, disabled, primary }: {
  label: string; onClick: () => void; busy: boolean; disabled?: boolean; primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      title={disabled ? `No ${label.toLowerCase()} on file for this practice` : `Send by ${label.toLowerCase()}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40',
        primary
          ? 'bg-teal-700 text-teal-50 hover:bg-teal-800'
          : 'border border-foreground/15 text-foreground/80 hover:bg-foreground/[0.05]',
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

/**
 * Did every practice on trial actually hear from us, and can I fix it if not?
 *
 * Reminders go out each morning on fixed day buckets — 7 days, then every day
 * of the final three, then the day it lapses.
 * Per-practice pages hid that: you had to open each one to find the gap.
 */
export default function AdminReminders() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'reminder-board'], queryFn: adminApi.reminderBoard });
  const rows = q.data ?? [];

  const send = useMutation({
    mutationFn: (v: { id: string; channel?: 'email' | 'whatsapp' }) =>
      adminApi.sendTrialReminder(v.id, v.channel),
    onSuccess: (r) => {
      if (r.sent) {
        const via = [r.email && 'email', r.whatsapp && 'WhatsApp'].filter(Boolean).join(' and ');
        toast.success(`Reminder sent by ${via}.`);
      } else {
        toast.error(r.reason ?? 'Nothing was sent.');
      }
      qc.invalidateQueries({ queryKey: ['admin', 'reminder-board'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not send the reminder.'),
  });

  /** Nothing scheduled today, and the last warning is stale or missing. */
  const needsAttention = (r: Row) => {
    if (r.days_left < 0) return false;
    const dueToday = BUCKETS.includes(r.days_left) && !r.sent.some((s) => s.days_bucket === r.days_left);
    const noneEverSent = r.sent.length === 0;
    return dueToday || noneEverSent;
  };

  const attention = rows.filter(needsAttention);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-8 md:py-12">
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
        <motion.div variants={fadeUp}>
          <AdminHeader
            eyebrow="Operations · Reminders"
            title="Trial reminders"
            subtitle={`Who has been told their trial is ending, through which channel, and what goes out next. Warnings run at ${TRIAL_WARN_TIME} at 7 days left, then every day of the final three, and again on the day it lapses.`}
          />
        </motion.div>

        {attention.length > 0 && (
          <motion.div variants={fadeUp}>
            <div className="rounded-2xl bg-amber-500/12 px-5 py-3 text-sm text-amber-900 dark:text-amber-200">
              <b>{attention.length} practice{attention.length === 1 ? '' : 's'}</b>{' '}
              {attention.length === 1 ? 'has' : 'have'} a reminder due that has not gone out.
            </div>
          </motion.div>
        )}

        {q.isLoading ? (
          <Glass className="grid place-items-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
          </Glass>
        ) : rows.length === 0 ? (
          <Glass className="px-5 py-16 text-center text-sm text-foreground/60">
            No practice is on trial right now.
          </Glass>
        ) : (
          rows.map((r) => {
            const nextBucket = BUCKETS.find((b) => b < r.days_left) ?? null;
            const dueToday = r.days_left >= 0 && BUCKETS.includes(r.days_left)
              && !r.sent.some((s) => s.days_bucket === r.days_left);
            const over = r.days_left < 0;

            return (
              <motion.div key={r.workspace_id} variants={fadeUp}>
                <Glass className="overflow-hidden">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-foreground/[0.06] px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <Link to={`/admin/workspaces/${r.workspace_id}`} className="text-sm font-semibold hover:underline">
                        {r.name}
                      </Link>
                      <div className="truncate text-[11.5px] text-foreground/55">
                        {r.owner_email ?? 'no email'}
                        {r.owner_phone ? ` · ${r.owner_phone}` : ' · no phone'}
                        {r.plan_key ? ` · chose ${PLAN[r.plan_key] ?? r.plan_key}` : ''}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={cn('text-sm font-semibold tabular-nums',
                        over ? 'text-rose-700 dark:text-rose-300'
                          : r.days_left <= 3 ? 'text-amber-700 dark:text-amber-300' : 'text-foreground')}>
                        {over ? `${Math.abs(r.days_left)}d over` : `${r.days_left}d left`}
                      </div>
                      <div className="text-[11px] text-foreground/55">
                        {over ? 'ended' : 'ends'} {day(r.trial_ends_at)}
                        {r.next_charge_inr != null ? ` · ${INR.format(r.next_charge_inr)}` : ''}
                      </div>
                    </div>

                    {/* One button per channel: a practice with no phone can
                        still be emailed, and a failed WhatsApp can be retried
                        without sending the email twice. */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SendButton label="Email" disabled={!r.owner_email}
                        busy={send.isPending && send.variables?.id === r.workspace_id && send.variables?.channel === 'email'}
                        onClick={() => send.mutate({ id: r.workspace_id, channel: 'email' })} />
                      <SendButton label="WhatsApp" disabled={!r.owner_phone}
                        busy={send.isPending && send.variables?.id === r.workspace_id && send.variables?.channel === 'whatsapp'}
                        onClick={() => send.mutate({ id: r.workspace_id, channel: 'whatsapp' })} />
                      <SendButton label="Both" primary
                        disabled={!r.owner_email && !r.owner_phone}
                        busy={send.isPending && send.variables?.id === r.workspace_id && !send.variables?.channel}
                        onClick={() => send.mutate({ id: r.workspace_id })} />
                    </div>
                  </div>

                  <div className="px-5 py-2.5 text-[12px] text-foreground/65">
                    {over ? 'Trial has ended — nothing further is scheduled.'
                      : dueToday ? <span className="font-semibold text-amber-700 dark:text-amber-300">{`Due today at ${TRIAL_WARN_TIME} and not yet sent.`}</span>
                      : nextBucket !== null
                        ? <>Next automatic reminder at <b>{nextBucket} day{nextBucket === 1 ? '' : 's'} left</b>
                            {' '}— in {r.days_left - nextBucket} day{r.days_left - nextBucket === 1 ? '' : 's'}, {TRIAL_WARN_TIME}.</>
                        : 'Nothing further scheduled before the trial ends.'}
                  </div>

                  {r.sent.length === 0 ? (
                    <p className="border-t border-foreground/[0.04] px-5 py-5 text-center text-[13px] text-foreground/55">
                      Nothing sent yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-foreground/[0.04] border-t border-foreground/[0.04]">
                      {r.sent.map((m, i) => {
                        const reached = m.source.includes('email');
                        return (
                          <li key={`${m.sent_at}-${i}`} className="flex items-center gap-3 px-5 py-2.5">
                            {reached
                              ? <Check className="h-3.5 w-3.5 flex-shrink-0 text-teal-600" />
                              : <X className="h-3.5 w-3.5 flex-shrink-0 text-foreground/30" />}
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px]">{m.title}</div>
                              <div className="text-[11px] text-foreground/55">{when(m.sent_at)}</div>
                            </div>
                            <div className="flex flex-shrink-0 items-center gap-1">
                              <ChannelChip label="Email" on={m.channels.email} />
                              <ChannelChip label="WhatsApp" on={m.channels.whatsapp} />
                              <ChannelChip label="In-app" on={m.channels.in_app} />
                            </div>
                            {m.days_bucket !== null && (
                              <span className="flex-shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10.5px] font-semibold text-foreground/65">
                                {m.days_bucket}d
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Glass>
              </motion.div>
            );
          })
        )}

        <motion.div variants={fadeUp}>
          <p className="flex items-center gap-2 text-[11.5px] text-foreground/45">
            <Bell className="h-3 w-3" />
            A manual send claims the same slot as the scheduled job, so the two cannot both reach a practice on one day.
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
