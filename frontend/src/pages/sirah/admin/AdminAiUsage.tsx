import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertOctagon,
  CheckCircle2,
  CircleDollarSign,
  Sparkles,
  Zap,
} from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import {
  adminApi,
  type UsageAnomalyAlert,
  type UsageByService,
  type UsageByWorkspace,
  type UsageSnapshot,
  type UsageTrendPoint,
} from '@/modules/super-admin/api/admin';
import { cn } from '@/lib/utils';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const NUM = new Intl.NumberFormat('en-IN');

export default function AdminAiUsage() {
  const snapshotQ = useQuery<UsageSnapshot>({
    queryKey: ['admin', 'usage', 'snapshot'],
    queryFn: () => adminApi.usageSnapshot(),
    staleTime: 30_000,
  });
  const byServiceQ = useQuery<UsageByService[]>({
    queryKey: ['admin', 'usage', 'by-service'],
    queryFn: () => adminApi.usageByService(),
    staleTime: 60_000,
  });
  const topWsQ = useQuery<UsageByWorkspace[]>({
    queryKey: ['admin', 'usage', 'top-workspaces'],
    queryFn: () => adminApi.usageTopWorkspaces(15),
    staleTime: 60_000,
  });
  const trendQ = useQuery<UsageTrendPoint[]>({
    queryKey: ['admin', 'usage', 'trend'],
    queryFn: () => adminApi.usageTrend(30),
    staleTime: 60_000,
  });
  const anomQ = useQuery<UsageAnomalyAlert[]>({
    queryKey: ['admin', 'usage', 'anomalies'],
    queryFn: () => adminApi.usageAnomalies(),
    staleTime: 60_000,
  });

  const s = snapshotQ.data;
  const hasData = !!s && s.total_calls > 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8 md:py-12">
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-8">
        <motion.div variants={fadeUp} className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/60">
            AI usage
          </span>
          <h1 className="text-balance">Token spend, latency, anomalies.</h1>
          <p className="text-pretty text-base text-foreground/80 dark:text-foreground/65 md:text-lg md:leading-relaxed">
            Every Gemini / Claude / OpenAI call lands in <code className="rounded bg-foreground/[0.06] px-1.5 py-0.5 text-sm">ai_usage_events</code> via the metering middleware.
          </p>
        </motion.div>

        {/* KPIs */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            icon={Activity} label="Total calls"
            value={s ? NUM.format(s.total_calls) : '—'}
            hint={s ? `${NUM.format(s.last_24h_calls)} in last 24h` : 'all time'}
            loading={snapshotQ.isLoading}
          />
          <Kpi
            icon={CircleDollarSign} label="Total spend" tone="accent"
            value={s ? INR.format(s.total_cost_inr) : '—'}
            hint={s ? `${INR.format(s.last_24h_cost_inr)} last 24h` : 'all time'}
            loading={snapshotQ.isLoading}
          />
          <Kpi
            icon={Zap} label="Tokens"
            value={s ? NUM.format(s.total_tokens) : '—'}
            hint={s ? `${NUM.format(s.last_24h_tokens)} in last 24h` : 'all providers'}
            loading={snapshotQ.isLoading}
          />
          <Kpi
            icon={CheckCircle2} label="Success rate"
            value={s ? `${s.success_rate}%` : '—'}
            hint={s ? `${s.errors} errors total` : 'last 30d'}
            tone={s && s.success_rate < 95 ? 'warning' : 'neutral'}
            loading={snapshotQ.isLoading}
          />
        </motion.div>

        {/* By-service + anomalies */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Glass className="p-6">
            <header className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">By service (last 30d)</h2>
              <Sparkles className="h-4 w-4 text-violet-700 dark:text-violet-300" />
            </header>
            {byServiceQ.isLoading && <p className="text-sm text-foreground/60">Loading…</p>}
            {!byServiceQ.isLoading && (byServiceQ.data?.length ?? 0) === 0 && (
              <EmptyHint label="No calls in the last 30 days" />
            )}
            <ul className="space-y-3">
              {(byServiceQ.data ?? []).map((row) => {
                const total = (byServiceQ.data ?? []).reduce((a, r) => a + r.calls, 0);
                const pct = total > 0 ? Math.round((row.calls / total) * 100) : 0;
                return (
                  <li key={row.service}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium capitalize">{row.service}</span>
                      <span className="text-foreground/70">
                        {NUM.format(row.calls)} calls · {INR.format(row.cost_inr)} · {row.avg_latency_ms}ms avg
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.05]">
                      <div className="h-full bg-gradient-to-r from-blue-600 to-fuchsia-500" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Glass>

          <Glass className="p-6">
            <header className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Anomalies (24h)</h2>
              <AlertOctagon className={`h-4 w-4 ${(anomQ.data?.length ?? 0) > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-foreground/40'}`} />
            </header>
            {anomQ.isLoading && <p className="text-sm text-foreground/60">Loading…</p>}
            {!anomQ.isLoading && (anomQ.data?.length ?? 0) === 0 && (
              <p className="text-sm text-foreground/65">No workspace exceeding 5× its prior-24h rate.</p>
            )}
            <ul className="space-y-2">
              {(anomQ.data ?? []).map((a) => (
                <li key={a.workspace_id} className="flex items-center justify-between rounded-lg border border-amber-300/30 bg-amber-300/5 px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{a.workspace_name ?? a.workspace_id?.slice(0, 8)}</div>
                    <div className="text-xs text-foreground/65">{NUM.format(a.calls_24h)} now · {NUM.format(a.calls_prev_24h)} prior</div>
                  </div>
                  <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-200">
                    {a.multiplier}× spike
                  </span>
                </li>
              ))}
            </ul>
          </Glass>
        </motion.div>

        {/* Trend */}
        <motion.div variants={fadeUp}>
          <Glass className="p-6">
            <header className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Daily calls — last 30 days</h2>
              <Activity className="h-4 w-4 text-violet-700 dark:text-violet-300" />
            </header>
            {trendQ.isLoading && <p className="text-sm text-foreground/60">Loading…</p>}
            {!trendQ.isLoading && (trendQ.data?.length ?? 0) === 0 && <EmptyHint label="No usage in the last 30 days" />}
            {(trendQ.data?.length ?? 0) > 0 && <TrendBars data={trendQ.data!} />}
          </Glass>
        </motion.div>

        {/* Top workspaces */}
        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden p-0">
            <header className="flex items-center justify-between border-b border-foreground/[0.06] px-6 py-4">
              <h2 className="text-lg font-semibold tracking-tight">Top workspaces (this month)</h2>
              <span className="text-xs text-foreground/55">Quota = plan-mapped call limit</span>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-foreground/[0.06] bg-foreground/[0.02] text-left text-[11px] uppercase tracking-[0.14em] text-foreground/55">
                  <tr>
                    <th className="px-5 py-3">Workspace</th>
                    <th className="px-5 py-3">Calls</th>
                    <th className="px-5 py-3">Tokens</th>
                    <th className="px-5 py-3">Cost</th>
                    <th className="px-5 py-3">Quota</th>
                  </tr>
                </thead>
                <tbody>
                  {topWsQ.isLoading && (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-foreground/55">Loading…</td></tr>
                  )}
                  {!topWsQ.isLoading && (topWsQ.data?.length ?? 0) === 0 && (
                    <tr><td colSpan={5} className="px-5 py-12 text-center text-foreground/55">No workspace activity this month.</td></tr>
                  )}
                  {(topWsQ.data ?? []).map((w) => (
                    <tr key={w.workspace_id} className="border-b border-foreground/[0.04] last:border-0">
                      <td className="px-5 py-3 font-medium">{w.workspace_name ?? w.workspace_id.slice(0, 8)}</td>
                      <td className="px-5 py-3">{NUM.format(w.calls)}</td>
                      <td className="px-5 py-3 text-foreground/75">{NUM.format(w.tokens)}</td>
                      <td className="px-5 py-3">{INR.format(w.cost_inr)}</td>
                      <td className="px-5 py-3"><QuotaBar w={w} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Glass>
        </motion.div>

        {!hasData && !snapshotQ.isLoading && (
          <motion.div variants={fadeUp}>
            <Glass className="border-amber-400/30 bg-amber-400/5 p-5 text-sm text-foreground/80">
              <strong className="text-amber-700 dark:text-amber-300">No usage events yet.</strong>{' '}
              Food vision, voice logging, plate insights, and the weekly coach summary each write to{' '}
              <code>ai_usage_events</code> when used. As practitioners use these AI features, this dashboard fills in automatically.
            </Glass>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint, loading, tone = 'neutral' }: {
  icon: typeof Activity; label: string; value: string | number; hint: string; loading: boolean;
  tone?: 'neutral' | 'accent' | 'warning';
}) {
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

function TrendBars({ data }: { data: UsageTrendPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.calls));
  return (
    <div className="flex items-end gap-[3px]">
      {data.map((d) => {
        const h = Math.max(4, Math.round((d.calls / max) * 140));
        return (
          <div key={d.day} className="flex-1 rounded-sm bg-gradient-to-t from-blue-600 to-fuchsia-500"
            style={{ height: `${h}px` }}
            title={`${d.day} · ${NUM.format(d.calls)} calls · ${INR.format(d.cost_inr)}`} />
        );
      })}
    </div>
  );
}

function QuotaBar({ w }: { w: UsageByWorkspace }) {
  if (!w.quota_limit || w.quota_status === 'unknown') {
    return <span className="text-xs text-foreground/55">—</span>;
  }
  const pct = Math.min(100, Math.round((w.calls / w.quota_limit) * 100));
  const barColor =
    w.quota_status === 'over' ? 'from-rose-600 to-rose-400'
      : w.quota_status === 'warn' ? 'from-amber-500 to-amber-300'
      : 'from-emerald-500 to-emerald-300';
  return (
    <div className="flex w-32 items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.05]">
        <div className={cn('h-full rounded-full bg-gradient-to-r', barColor)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-foreground/65">{pct}%</span>
    </div>
  );
}