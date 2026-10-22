import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CreditCard,
  HeartCrack,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { AdminHeader } from './AdminHeader';
import {
  adminApi,
  type MonthlyRevenuePoint,
  type PlanRevenueBreakdown,
  type RevenueSnapshot,
} from '@/modules/super-admin/api/admin';

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export default function AdminRevenue() {
  // retry: 1 so backend errors (e.g. missing migration → table doesn't exist)
  // surface within ~5s instead of being buried under 3 retries × exponential
  // backoff. The default 3-retry policy is for transient network blips, not
  // for "the table doesn't exist" which won't fix itself.
  const snapshotQ = useQuery<RevenueSnapshot>({
    queryKey: ['admin', 'revenue', 'snapshot'],
    queryFn: () => adminApi.revenueSnapshot(),
    staleTime: 60_000,
    retry: 1,
  });
  const planQ = useQuery<PlanRevenueBreakdown[]>({
    queryKey: ['admin', 'revenue', 'by-plan'],
    queryFn: () => adminApi.revenueByPlan(),
    staleTime: 60_000,
    retry: 1,
  });
  const monthlyQ = useQuery<MonthlyRevenuePoint[]>({
    queryKey: ['admin', 'revenue', 'monthly'],
    queryFn: () => adminApi.monthlyRevenue(12),
    staleTime: 60_000,
    retry: 1,
  });

  const s = snapshotQ.data;
  const hasAnyData =
    !!s && (s.total_inr > 0 || s.active_subs > 0 || s.failed_payments > 0 || s.checkouts_open > 0);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8 md:py-12">
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="space-y-8"
      >
        <motion.div variants={fadeUp}>
          <AdminHeader
            eyebrow="Revenue analytics"
            title="MRR, ARR, plan mix, monthly trend."
            subtitle={<>NUSI&apos;s own income, from Razorpay. Amounts include 18% GST; &ldquo;excl. GST&rdquo; is what stays with NUSI. Yearly plans count as a twelfth per month. The ₹1 test coupon, free / NUSI-own practices and practice store sales are left out. Months are Indian months.</>}
          />
        </motion.div>

        {snapshotQ.error && (
          <Glass className="border-rose-400/40 bg-rose-400/5 p-4 text-sm text-rose-700 dark:text-rose-200">
            Couldn't load revenue snapshot: {(snapshotQ.error as Error).message}
          </Glass>
        )}

        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            icon={TrendingUp} label="MRR" tone="accent"
            value={s ? INR.format(s.mrr_inr) : '-'}
            hint={s ? `excl. GST ${INR.format(s.mrr_net_inr)} · ARR ${INR.format(s.arr_inr)}` : 'monthly recurring'}
            loading={snapshotQ.isLoading}
          />
          <Kpi
            icon={Wallet} label="Last 30 days"
            value={s ? INR.format(s.last_30d_inr) : '-'}
            hint={s ? `excl. GST ${INR.format(s.last_30d_net_inr)} · all time ${INR.format(s.total_inr)}` : 'after refunds'}
            loading={snapshotQ.isLoading}
          />
          <Kpi
            icon={Users} label="Paying practices"
            value={s?.active_subs ?? '-'}
            hint={s ? `${s.trialing_subs} on free trial · ${s.checkouts_open} checkouts not paid` : 'current paid plan'}
            loading={snapshotQ.isLoading}
          />
          <Kpi
            icon={HeartCrack} label="Cancelled (30d)"
            value={s?.cancelled_30d ?? '-'}
            hint="paying practices that cancelled"
            loading={snapshotQ.isLoading}
            tone={s && s.cancelled_30d > 0 ? 'warning' : 'neutral'}
          />
        </motion.div>

        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Glass className="p-6">
            <header className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Revenue by plan</h2>
              <CreditCard className="h-4 w-4 text-teal-700 dark:text-teal-300" />
            </header>
            {planQ.isLoading && <p className="text-sm text-foreground/60">Loading…</p>}
            {planQ.isError && <ErrorHint what="the plan mix" onRetry={() => void planQ.refetch()} />}
            {planQ.isSuccess && planQ.data.length === 0 && (
              <EmptyHint label="No paying practices yet" />
            )}
            <ul className="space-y-3">
              {(planQ.data ?? []).map((p) => {
                const total = (planQ.data ?? []).reduce((acc, r) => acc + r.mrr_inr, 0);
                const pct = total > 0 ? Math.round((p.mrr_inr / total) * 100) : 0;
                return (
                  <li key={p.plan_key}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium capitalize">{p.plan_key.replace('_', ' ')}</span>
                      <span className="text-foreground/70">
                        {INR.format(p.mrr_inr)}/mo · excl. GST {INR.format(p.mrr_net_inr)} · {p.active_count} paying
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.05]">
                      <div
                        className="h-full bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Glass>

          <Glass className="p-6">
            <header className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Renewals failing</h2>
              <AlertTriangle className={`h-4 w-4 ${s && s.past_due_subs > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-foreground/40'}`} />
            </header>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-semibold tracking-tight">{s?.past_due_subs ?? '-'}</span>
              <span className="text-sm text-foreground/70">practices whose renewal didn&apos;t go through</span>
            </div>
            <p className="mt-2 text-sm text-foreground/60">
              {s ? `${s.failed_payments} failed payment attempt${s.failed_payments === 1 ? '' : 's'} in the last 30 days. ` : ''}
              Razorpay retries these automatically; the daily billing automation reminds the practice.
            </p>
            {s && (
              <div className="mt-5 border-t border-foreground/[0.06] pt-4 text-sm">
                <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-foreground/60">Last 30 days, by what was paid for</div>
                <dl className="grid grid-cols-3 gap-3">
                  <Split label="Subscriptions" value={s.last_30d_by_kind.subscription_inr} />
                  <Split label="AI credit packs" value={s.last_30d_by_kind.topup_inr} />
                  <Split label="Other" value={s.last_30d_by_kind.other_inr} />
                </dl>
                <p className="mt-3 text-xs text-foreground/60">
                  Practice store sales (clients buying a practice&apos;s products): {INR.format(s.store_sales_30d_inr)}. That money is the
                  practices&apos;, not NUSI income.
                </p>
              </div>
            )}
          </Glass>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Glass className="p-6">
            <header className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Last 12 months</h2>
              <TrendingUp className="h-4 w-4 text-teal-700 dark:text-teal-300" />
            </header>
            {monthlyQ.isLoading && <p className="text-sm text-foreground/60">Loading…</p>}
            {monthlyQ.isError && <ErrorHint what="the monthly trend" onRetry={() => void monthlyQ.refetch()} />}
            {monthlyQ.isSuccess && monthlyQ.data.every((m) => m.revenue_inr === 0) && (
              <EmptyHint label="No NUSI income in the last 12 months yet" />
            )}
            {monthlyQ.isSuccess && monthlyQ.data.some((m) => m.revenue_inr > 0) && (
              <MonthlyBars data={monthlyQ.data} />
            )}
          </Glass>
        </motion.div>

        {snapshotQ.isSuccess && !hasAnyData && (
          <motion.div variants={fadeUp}>
            <Glass className="border-amber-400/30 bg-amber-400/5 p-5 text-sm text-foreground/80">
              <strong className="text-amber-700 dark:text-amber-300">No paying practices yet.</strong>{' '}
              Payments and subscriptions arrive here from Razorpay&apos;s webhook (
              <code>/api/v1/webhooks/razorpay</code>) as soon as practices start paying.
            </Glass>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

interface KpiProps {
  icon: typeof TrendingUp;
  label: string;
  value: string | number;
  hint: string;
  loading: boolean;
  tone?: 'neutral' | 'accent' | 'warning';
}
function Kpi({ icon: Icon, label, value, hint, loading, tone = 'neutral' }: KpiProps) {
  const accent =
    tone === 'warning' ? 'text-amber-700 dark:text-amber-300'
      : tone === 'accent' ? 'text-teal-700 dark:text-teal-300'
      : 'text-foreground/70';
  return (
    <Glass className="p-6">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">{label}</span>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight">
        {loading ? <span className="inline-block h-7 w-20 animate-pulse rounded bg-foreground/[0.06]" /> : value}
      </div>
      <div className="mt-1 text-xs text-foreground/65">{hint}</div>
    </Glass>
  );
}

function Split({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-foreground/60">{label}</dt>
      <dd className="mt-0.5 font-semibold">{INR.format(value)}</dd>
    </div>
  );
}

function ErrorHint({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
      Couldn&apos;t load {what}.
      <button type="button" onClick={onRetry} className="rounded-full border border-current/30 px-3 py-1 text-xs font-semibold">
        Try again
      </button>
    </div>
  );
}

function EmptyHint({ label }: { label: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-foreground/15 px-6 py-10 text-center text-sm text-foreground/65">
      {label}
    </div>
  );
}

function MonthlyBars({ data }: { data: MonthlyRevenuePoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.revenue_inr));
  const fmt = new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' });
  return (
    <div className="grid grid-cols-12 items-end gap-2">
      {data.map((d) => {
        const h = Math.max(4, Math.round((d.revenue_inr / max) * 160));
        return (
          <div key={d.month} className="flex flex-col items-center gap-1">
            <div
              className="w-full rounded-md bg-gradient-to-t from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]"
              style={{ height: `${h}px` }}
              title={`${INR.format(d.revenue_inr)} (excl. GST ${INR.format(d.revenue_net_inr)}) · ${d.payment_count} payments`}
            />
            <span className="text-[10px] uppercase tracking-[0.14em] text-foreground/60">
              {fmt.format(new Date(`${d.month}T00:00:00`))}
            </span>
          </div>
        );
      })}
    </div>
  );
}