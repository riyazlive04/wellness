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
    !!s && (s.total_inr > 0 || s.active_subs > 0 || s.failed_payments > 0);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8 md:py-12">
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="space-y-8"
      >
        <motion.div variants={fadeUp} className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/60">
            Revenue analytics
          </span>
          <h1 className="text-balance">MRR, ARR, plan mix, monthly trend.</h1>
          <p className="text-pretty text-base text-foreground/80 dark:text-foreground/65 md:text-lg md:leading-relaxed">
            Aggregated from <code className="rounded bg-foreground/[0.06] px-1.5 py-0.5 text-sm">payments</code> +{' '}
            <code className="rounded bg-foreground/[0.06] px-1.5 py-0.5 text-sm">subscriptions</code> — populated by the Razorpay webhook.
          </p>
        </motion.div>

        {snapshotQ.error && (
          <Glass className="border-rose-400/40 bg-rose-400/5 p-4 text-sm text-rose-700 dark:text-rose-200">
            Couldn't load revenue snapshot: {(snapshotQ.error as Error).message}
          </Glass>
        )}

        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            icon={TrendingUp} label="MRR" tone="accent"
            value={s ? INR.format(s.mrr_inr) : '—'}
            hint={s ? `ARR ${INR.format(s.arr_inr)}` : 'monthly recurring'}
            loading={snapshotQ.isLoading}
          />
          <Kpi
            icon={Wallet} label="Last 30d revenue"
            value={s ? INR.format(s.last_30d_inr) : '—'}
            hint={s ? `total ${INR.format(s.total_inr)}` : 'captured'}
            loading={snapshotQ.isLoading}
          />
          <Kpi
            icon={Users} label="Active subscriptions"
            value={s?.active_subs ?? '—'}
            hint={s ? `${s.trialing_subs} trialing · ${s.past_due_subs} past-due` : 'paying workspaces'}
            loading={snapshotQ.isLoading}
          />
          <Kpi
            icon={HeartCrack} label="Churn (30d)"
            value={s?.cancelled_30d ?? '—'}
            hint="subscriptions cancelled"
            loading={snapshotQ.isLoading}
            tone={s && s.cancelled_30d > 0 ? 'warning' : 'neutral'}
          />
        </motion.div>

        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Glass className="p-6">
            <header className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Revenue by plan</h2>
              <CreditCard className="h-4 w-4 text-violet-700 dark:text-violet-300" />
            </header>
            {planQ.isLoading && <p className="text-sm text-foreground/60">Loading…</p>}
            {!planQ.isLoading && (planQ.data?.length ?? 0) === 0 && (
              <EmptyHint label="No active subscriptions yet" />
            )}
            <ul className="space-y-3">
              {(planQ.data ?? []).map((p) => {
                const total = (planQ.data ?? []).reduce((acc, r) => acc + r.mrr_inr, 0);
                const pct = total > 0 ? Math.round((p.mrr_inr / total) * 100) : 0;
                return (
                  <li key={p.plan_key}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium capitalize">{p.plan_key}</span>
                      <span className="text-foreground/70">{INR.format(p.mrr_inr)} · {p.active_count} active</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.05]">
                      <div
                        className="h-full bg-gradient-to-r from-blue-600 to-fuchsia-500"
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
              <h2 className="text-lg font-semibold tracking-tight">Dunning queue</h2>
              <AlertTriangle className={`h-4 w-4 ${s && s.failed_payments > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-foreground/40'}`} />
            </header>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-semibold tracking-tight">{s?.failed_payments ?? '—'}</span>
              <span className="text-sm text-foreground/70">failed payments awaiting action</span>
            </div>
            <p className="mt-2 text-sm text-foreground/60">
              Manual retry / escalate tools live in the per-workspace billing detail view.
            </p>
          </Glass>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Glass className="p-6">
            <header className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Last 12 months</h2>
              <TrendingUp className="h-4 w-4 text-violet-700 dark:text-violet-300" />
            </header>
            {monthlyQ.isLoading && <p className="text-sm text-foreground/60">Loading…</p>}
            {!monthlyQ.isLoading && (monthlyQ.data?.length ?? 0) === 0 && (
              <EmptyHint label="No captured payments yet" />
            )}
            {(monthlyQ.data?.length ?? 0) > 0 && (
              <MonthlyBars data={monthlyQ.data!} />
            )}
          </Glass>
        </motion.div>

        {!hasAnyData && !snapshotQ.isLoading && (
          <motion.div variants={fadeUp}>
            <Glass className="border-amber-400/30 bg-amber-400/5 p-5 text-sm text-foreground/80">
              <strong className="text-amber-700 dark:text-amber-300">No billing data yet.</strong>{' '}
              Once Razorpay is connected (set <code>RAZORPAY_WEBHOOK_SECRET</code> + point Razorpay at{' '}
              <code>/api/v1/webhooks/razorpay</code>), every payment, subscription, and invoice will appear here automatically.
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
      : tone === 'accent' ? 'text-violet-700 dark:text-violet-300'
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
              className="w-full rounded-md bg-gradient-to-t from-blue-600 to-fuchsia-500"
              style={{ height: `${h}px` }}
              title={`${INR.format(d.revenue_inr)} · ${d.payment_count} payments`}
            />
            <span className="text-[10px] uppercase tracking-[0.14em] text-foreground/60">
              {fmt.format(new Date(d.month))}
            </span>
          </div>
        );
      })}
    </div>
  );
}