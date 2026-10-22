import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CreditCard, Download, Search } from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import {
  adminApi,
  type ListSubscriptionsResult,
  type SubscriptionStatus,
} from '@/modules/super-admin/api/admin';
import { cn } from '@/lib/utils';
import { AdminHeader } from './AdminHeader';
import { ConvertingTrials } from './ConvertingTrials';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const DATE = new Intl.DateTimeFormat('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

type StatusFilter = SubscriptionStatus | 'all';

/** A number describing the whole filtered set, not the page on screen. */
function SubTile({ label, value, sub, tone }: {
  label: string; value: string; sub: string; tone: 'money' | 'warn' | 'plain';
}) {
  const t = {
    money: 'bg-teal-500/12 text-teal-800 dark:text-teal-200',
    warn:  'bg-amber-500/14 text-amber-800 dark:text-amber-200',
    plain: 'bg-foreground/[0.04] text-foreground',
  }[tone];
  return (
    <div className={cn('rounded-xl px-3.5 py-3', t)}>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.13em] opacity-70">{label}</div>
      <div className="mt-1 text-xl font-extrabold tabular-nums tracking-tight">{value}</div>
      <div className="text-[11px] opacity-65">{sub}</div>
    </div>
  );
}

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'active',     label: 'Paying' },
  // Razorpay 'created' = checkout opened but never paid (not a free trial).
  { key: 'created',    label: 'Checkout not paid' },
  { key: 'pending',    label: 'Renewal retrying' },
  { key: 'halted',     label: 'Renewal failed' },
  { key: 'cancelled',  label: 'Cancelled' },
  { key: 'expired',    label: 'Expired' },
];

export default function AdminSubscriptions() {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const limit = 25;

  const { data, isLoading, error } = useQuery<ListSubscriptionsResult>({
    queryKey: ['admin', 'subscriptions', status, q, page],
    queryFn: () => adminApi.listSubscriptions({
      status: status === 'all' ? undefined : status,
      q: q || undefined,
      limit, offset: page * limit,
    }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const sum = data?.summary;

  /** The current filter as a file — for the books, or a board update. */
  async function exportCsv() {
    const all = await adminApi.listSubscriptions({
      status: status === 'all' ? undefined : status,
      q: q || undefined,
      limit: 200, offset: 0,
    });
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Workspace', 'Owner', 'Plan', 'Cycle', 'Status', 'Per month INR',
                  'Lifetime paid INR', 'Payments', 'Started', 'Next billing'];
    const lines = all.items.map((r) => [
      r.workspace_name, r.owner_email, r.plan_key, r.billing_cycle ?? 'monthly', r.status,
      (r.amount_paise ?? 0) / 100, r.lifetime_paid_inr ?? 0, r.payment_count ?? 0,
      r.started_at?.slice(0, 10) ?? '', r.current_period_end?.slice(0, 10) ?? '',
    ].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nusi-subscriptions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8 md:py-12">
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="space-y-6"
      >
        <motion.div variants={fadeUp}>
          <AdminHeader
            eyebrow="Subscriptions"
            title="Every Razorpay subscription."
            subtitle={<>Paying, unpaid checkouts, failed renewals and cancelled ones. &ldquo;Per month&rdquo; spreads a yearly price over 12 months and includes GST. Test (₹1) and free-practice rows are marked and left out of MRR.</>}
          />
        </motion.div>

        <motion.div variants={fadeUp}>
          <ConvertingTrials />
        </motion.div>

        {/* The position for the current filter, not just the page on screen. */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SubTile label="MRR" value={sum ? INR.format(sum.mrr_inr) : '—'}
            sub="billing subscriptions only" tone="money" />
          <SubTile label="Live" value={sum ? String(sum.live_count) : '—'}
            sub="active or authenticated" tone="money" />
          <SubTile label="Not paid" value={sum ? String(sum.unpaid_count) : '—'}
            sub={sum && sum.unpaid_count > 0 ? 'checkouts abandoned' : 'none'}
            tone={sum && sum.unpaid_count > 0 ? 'warn' : 'plain'} />
          <SubTile label="Cancelled" value={sum ? String(sum.cancelled_count) : '—'}
            sub="ended by the practice" tone="plain" />
        </motion.div>

        <motion.div variants={fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => { setStatus(t.key); setPage(0); }}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  status === t.key
                    ? 'bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white'
                    : 'border border-foreground/[0.08] bg-foreground/[0.03] text-foreground/70 hover:bg-foreground/[0.06]',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/45" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder="Search workspace name / owner email"
              className="w-full rounded-lg border border-foreground/[0.08] bg-foreground/[0.02] py-2 pl-9 pr-3 text-sm placeholder:text-foreground/40 focus:border-teal-400 focus:outline-none"
            />
          </div>
          <button type="button" onClick={() => void exportCsv()} disabled={!data?.total}
            className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-lg border border-foreground/15 px-3 text-xs font-semibold text-foreground/80 transition-colors hover:bg-foreground/[0.04] disabled:opacity-50">
            <Download className="h-3.5 w-3.5" />Export CSV
          </button>
        </motion.div>

        {error && (
          <Glass className="border-rose-400/40 bg-rose-400/5 p-4 text-sm text-rose-700 dark:text-rose-200">
            Couldn't load subscriptions: {(error as Error).message}
          </Glass>
        )}

        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-foreground/[0.06] bg-foreground/[0.02] text-left text-[11px] uppercase tracking-[0.14em] text-foreground/55">
                  <tr>
                    <th className="px-5 py-3">Workspace</th>
                    <th className="px-5 py-3">Plan</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Per month</th>
                    <th className="px-5 py-3">Paid so far</th>
                    <th className="px-5 py-3">Next billing</th>
                    <th className="px-5 py-3">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr><td colSpan={7} className="px-5 py-8 text-center text-foreground/55">Loading…</td></tr>
                  )}
                  {!isLoading && (data?.items.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center">
                        <div className="mx-auto max-w-md text-sm text-foreground/65">
                          <CreditCard className="mx-auto mb-3 h-8 w-8 text-foreground/30" />
                          <p className="font-medium text-foreground/80">No subscriptions match this filter.</p>
                          <p className="mt-1">
                            Subscriptions appear here as Razorpay webhooks (
                            <code>subscription.activated</code>, <code>subscription.charged</code> …) arrive.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                  {(data?.items ?? []).map((s) => (
                    <tr key={s.id} className="border-b border-foreground/[0.04] last:border-0">
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
                          {s.workspace_name ?? '-'}
                          {s.is_test && <span className="rounded-full bg-amber-400/15 px-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-200">₹1 test</span>}
                          {s.billing_exempt && <span className="rounded-full bg-sky-400/15 px-1.5 text-[10px] font-semibold text-sky-700 dark:text-sky-200">free practice</span>}
                        </div>
                        <div className="text-[11px] text-foreground/55">{s.owner_email ?? '-'}</div>
                      </td>
                      <td className="px-5 py-3 capitalize text-foreground/85">
                        {s.plan_key.replace('_', ' ')}
                        {s.billing_cycle === 'annual' && <span className="ml-1 text-[11px] normal-case text-foreground/55">yearly</span>}
                      </td>
                      <td className="px-5 py-3"><StatusPill status={s.status} /></td>
                      <td className="px-5 py-3">
                        {s.amount_paise
                          ? INR.format(s.amount_paise / 100 / (s.billing_cycle === 'annual' ? 12 : 1))
                          : '-'}
                      </td>
                      {/* What the agreement says vs what has actually landed. */}
                      <td className="px-5 py-3">
                        {s.lifetime_paid_inr ? (
                          <>
                            <div className="tabular-nums">{INR.format(s.lifetime_paid_inr)}</div>
                            <div className="text-[11px] text-foreground/55">
                              {s.payment_count} payment{s.payment_count === 1 ? '' : 's'}
                              {s.failed_30d ? ` · ${s.failed_30d} failed` : ''}
                            </div>
                          </>
                        ) : (
                          <span className="text-foreground/45">nothing yet</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-foreground/75">
                        {/* A next charge only exists while the subscription is live. */}
                        {s.current_period_end && ['active', 'pending', 'authenticated'].includes(s.status)
                          ? DATE.format(new Date(s.current_period_end))
                          : '-'}
                      </td>
                      <td className="px-5 py-3 text-foreground/75">
                        {s.started_at ? DATE.format(new Date(s.started_at)) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(total > 0) && (
              <div className="flex items-center justify-between border-t border-foreground/[0.06] px-5 py-3 text-xs text-foreground/65">
                <span>{total} total · page {page + 1} of {pages}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="rounded-lg border border-foreground/[0.08] px-2.5 py-1 hover:bg-foreground/[0.04] disabled:opacity-30"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={page >= pages - 1}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-foreground/[0.08] px-2.5 py-1 hover:bg-foreground/[0.04] disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </Glass>
        </motion.div>
      </motion.div>
    </div>
  );
}

function StatusPill({ status }: { status: SubscriptionStatus }) {
  const map: Record<SubscriptionStatus, string> = {
    active:        'border-teal-400/40 bg-teal-400/10 text-teal-700 dark:text-teal-200',
    authenticated: 'border-sky-400/40 bg-sky-400/10 text-sky-700 dark:text-sky-200',
    created:       'border-teal-400/40 bg-teal-400/10 text-teal-700 dark:text-teal-200',
    pending:       'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200',
    halted:        'border-rose-400/40 bg-rose-400/10 text-rose-700 dark:text-rose-200',
    paused:        'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200',
    cancelled:     'border-foreground/15 bg-foreground/[0.06] text-foreground/70',
    completed:     'border-foreground/15 bg-foreground/[0.06] text-foreground/70',
    expired:       'border-foreground/15 bg-foreground/[0.06] text-foreground/70',
  };
  return (
    <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]', map[status])}>
      {status}
    </span>
  );
}