import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CreditCard, Search } from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import {
  adminApi,
  type ListSubscriptionsResult,
  type SubscriptionStatus,
} from '@/modules/super-admin/api/admin';
import { cn } from '@/lib/utils';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const DATE = new Intl.DateTimeFormat('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

type StatusFilter = SubscriptionStatus | 'all';

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'active',     label: 'Active' },
  { key: 'created',    label: 'Trialing' },
  { key: 'halted',     label: 'Past due' },
  { key: 'cancelled',  label: 'Cancelled' },
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
    keepPreviousData: true,
    staleTime: 30_000,
  });

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
        <motion.div variants={fadeUp} className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/60">
            Subscriptions
          </span>
          <h1 className="text-balance">Every paying workspace.</h1>
          <p className="text-pretty text-base text-foreground/80 dark:text-foreground/65 md:text-lg md:leading-relaxed">
            Plan, status, next billing date, MRR contribution.
          </p>
        </motion.div>

        <motion.div variants={fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1">
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
              className="w-full rounded-lg border border-foreground/[0.08] bg-foreground/[0.02] py-2 pl-9 pr-3 text-sm placeholder:text-foreground/40 focus:border-violet-400 focus:outline-none"
            />
          </div>
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
                    <th className="px-5 py-3">MRR</th>
                    <th className="px-5 py-3">Next billing</th>
                    <th className="px-5 py-3">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr><td colSpan={6} className="px-5 py-8 text-center text-foreground/55">Loading…</td></tr>
                  )}
                  {!isLoading && (data?.items.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center">
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
                        <div className="font-medium text-foreground">{s.workspace_name ?? '—'}</div>
                        <div className="text-[11px] text-foreground/55">{s.owner_email ?? '—'}</div>
                      </td>
                      <td className="px-5 py-3 capitalize text-foreground/85">{s.plan_key}</td>
                      <td className="px-5 py-3"><StatusPill status={s.status} /></td>
                      <td className="px-5 py-3">{s.amount_paise ? INR.format(s.amount_paise / 100) : '—'}</td>
                      <td className="px-5 py-3 text-foreground/75">
                        {s.current_period_end ? DATE.format(new Date(s.current_period_end)) : '—'}
                      </td>
                      <td className="px-5 py-3 text-foreground/75">
                        {s.started_at ? DATE.format(new Date(s.started_at)) : '—'}
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
    active:        'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200',
    authenticated: 'border-sky-400/40 bg-sky-400/10 text-sky-700 dark:text-sky-200',
    created:       'border-violet-400/40 bg-violet-400/10 text-violet-700 dark:text-violet-200',
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