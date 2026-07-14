import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertOctagon,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  MessageSquare,
  Mic,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import {
  adminApi,
  type UsageAnomalyAlert,
  type UsageByModel,
  type UsageByService,
  type UsageByWorkspace,
  type UsageSnapshot,
  type UsageTrendPoint,
} from '@/modules/super-admin/api/admin';
import { cn } from '@/lib/utils';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const NUM = new Intl.NumberFormat('en-IN');

// ── "What is this AI used for?" — content shown when a box is clicked ──────

interface InfoContent {
  icon: typeof Activity;
  title: string;
  blurb: string;
  /** Concrete product features that drive this metric / service. */
  uses?: string[];
}

const METRIC_INFO: Record<'total_calls' | 'total_spend' | 'tokens' | 'success_rate', InfoContent> = {
  total_calls: {
    icon: Activity,
    title: 'Total AI calls',
    blurb: 'Every request the platform sends to an AI model — across all workspaces — is metered here: each chat message, each meal-photo analysis, each voice transcription. One feature use can be one call.',
    uses: [
      'AI Assistant chats (owner, clinical, client)',
      'Plate Vision meal-photo analysis',
      'Voice logging & the floating voice assistant',
      'Journal reflections, conversation summaries, analytics insights',
    ],
  },
  total_spend: {
    icon: CircleDollarSign,
    title: 'Total spend',
    blurb: 'The rupee cost of all those AI calls, billed by the model providers (Gemini / Claude / OpenAI). Chat (text) is usually the biggest driver because it processes the most tokens; vision costs more per call but runs less often.',
    uses: [
      'Charged per token (text) or per image (vision)',
      'Aggregated across every workspace on the platform',
      'Use "Top workspaces" below to see who spends most',
    ],
  },
  tokens: {
    icon: Zap,
    title: 'Tokens',
    blurb: 'Tokens are the chunks of text an AI model reads and writes (roughly ¾ of a word each). Input prompt + output answer both count. Token volume is what mostly determines chat cost.',
    uses: [
      'Driven by chat-style features (assistant, summaries, insights)',
      'Longer conversations & documents = more tokens',
      'Vision adds tokens for the description it returns',
    ],
  },
  success_rate: {
    icon: CheckCircle2,
    title: 'Success rate',
    blurb: 'The share of AI calls that completed without an error. A low rate usually means an invalid/rate-limited API key, a provider outage, or malformed requests — worth investigating when it dips below ~95%.',
    uses: [
      'Errors are logged against ai_usage_events',
      'Common causes: expired API key, quota/rate limits, timeouts',
      'Check Platform health → AI errors for details',
    ],
  },
};

const SERVICE_INFO: Record<string, InfoContent> = {
  chat: {
    icon: MessageSquare,
    title: 'Chat — text AI',
    blurb: 'Text generation powers most of the AI in NUSI. Each of these features sends a prompt to the model and shows the response.',
    uses: [
      'AI Assistant — role-aware chat (Executive / Clinical / Wellness) + morning brief',
      'Journal reflections on client entries',
      'Conversation summaries & smart replies on message threads',
      'Analytics insights ("your workspace at a glance")',
      'Automation "AI note" actions',
      'Enterprise AI recommendations & governance suggestions',
    ],
  },
  vision: {
    icon: Camera,
    title: 'Vision — image AI',
    blurb: 'Image understanding. A client photographs a meal and the model identifies the food and estimates its nutrition. Higher latency than chat because images are heavier to process.',
    uses: [
      'Plate Vision — meal-photo → food & nutrition estimate',
      'Feeds the nutritionist plate-review queue',
    ],
  },
  voice: {
    icon: Mic,
    title: 'Voice — speech AI',
    blurb: 'Speech-driven AI: spoken input is transcribed and answered. Used by the hands-free assistant on the client portal.',
    uses: [
      'Floating voice assistant (client portal)',
      'Voice meal / note logging',
    ],
  },
};

function serviceInfo(service: string): InfoContent {
  return SERVICE_INFO[service] ?? {
    icon: Sparkles,
    title: service,
    blurb: 'AI calls metered under this service.',
  };
}

export default function AdminAiUsage() {
  const [info, setInfo] = useState<InfoContent | null>(null);
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
  const byModelQ = useQuery<UsageByModel[]>({
    queryKey: ['admin', 'usage', 'by-model'],
    queryFn: () => adminApi.usageByModel(),
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
            onClick={() => setInfo(METRIC_INFO.total_calls)}
          />
          <Kpi
            icon={CircleDollarSign} label="Total spend" tone="accent"
            value={s ? INR.format(s.total_cost_inr) : '—'}
            hint={s ? `${INR.format(s.last_24h_cost_inr)} last 24h` : 'all time'}
            loading={snapshotQ.isLoading}
            onClick={() => setInfo(METRIC_INFO.total_spend)}
          />
          <Kpi
            icon={Zap} label="Tokens"
            value={s ? NUM.format(s.total_tokens) : '—'}
            hint={s ? `${NUM.format(s.last_24h_tokens)} in last 24h` : 'all providers'}
            loading={snapshotQ.isLoading}
            onClick={() => setInfo(METRIC_INFO.tokens)}
          />
          <Kpi
            icon={CheckCircle2} label="Success rate"
            value={s ? `${s.success_rate}%` : '—'}
            hint={s ? `${s.errors} errors total` : 'last 30d'}
            tone={s && s.success_rate < 95 ? 'warning' : 'neutral'}
            loading={snapshotQ.isLoading}
            onClick={() => setInfo(METRIC_INFO.success_rate)}
          />
        </motion.div>

        {/* By-service + anomalies */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Glass className="p-6">
            <header className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">By service (last 30d)</h2>
              <Sparkles className="h-4 w-4 text-teal-700 dark:text-teal-300" />
            </header>
            <p className="mb-4 text-xs text-foreground/55">Tap a service to see what it powers.</p>
            {byServiceQ.isLoading && <p className="text-sm text-foreground/60">Loading…</p>}
            {!byServiceQ.isLoading && (byServiceQ.data?.length ?? 0) === 0 && (
              <EmptyHint label="No calls in the last 30 days" />
            )}
            <ul className="space-y-2">
              {(byServiceQ.data ?? []).map((row) => {
                const total = (byServiceQ.data ?? []).reduce((a, r) => a + r.calls, 0);
                const pct = total > 0 ? Math.round((row.calls / total) * 100) : 0;
                return (
                  <li key={row.service}>
                    <button
                      type="button"
                      onClick={() => setInfo(serviceInfo(row.service))}
                      className="group w-full rounded-lg p-1.5 text-left transition-colors hover:bg-foreground/[0.03]"
                    >
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 font-medium capitalize">
                          {row.service}
                          <ChevronRight className="h-3.5 w-3.5 text-foreground/30 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground/55" />
                        </span>
                        <span className="text-foreground/70">
                          {NUM.format(row.calls)} calls · {INR.format(row.cost_inr)} · {row.avg_latency_ms}ms avg
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.05]">
                        <div className="h-full bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
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

        {/* Cost by AI model */}
        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden p-0">
            <header className="flex items-center justify-between border-b border-foreground/[0.06] px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Cost by AI model (last 30d)</h2>
                <p className="mt-0.5 text-xs text-foreground/55">Which model is spending the budget, and on what.</p>
              </div>
              <CircleDollarSign className="h-4 w-4 text-teal-700 dark:text-teal-300" />
            </header>
            {byModelQ.isLoading ? (
              <p className="px-6 py-8 text-sm text-foreground/60">Loading…</p>
            ) : (byModelQ.data?.length ?? 0) === 0 ? (
              <div className="px-6 py-10"><EmptyHint label="No AI calls in the last 30 days" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-foreground/[0.06] bg-foreground/[0.02] text-left text-[11px] uppercase tracking-[0.14em] text-foreground/55">
                    <tr>
                      <th className="px-6 py-3">Model</th>
                      <th className="px-5 py-3">Used for</th>
                      <th className="px-5 py-3 text-right">Calls</th>
                      <th className="px-5 py-3 text-right">Tokens</th>
                      <th className="px-5 py-3 text-right">Avg latency</th>
                      <th className="px-6 py-3 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(byModelQ.data ?? []).map((m) => (
                      <tr key={`${m.provider}:${m.model}`} className="border-b border-foreground/[0.04] last:border-0">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{m.model}</span>
                            <ProviderBadge provider={m.provider} />
                          </div>
                          {m.errors > 0 && (
                            <div className="mt-0.5 text-[11px] text-rose-600 dark:text-rose-300">{NUM.format(m.errors)} errors</div>
                          )}
                        </td>
                        <td className="px-5 py-3 capitalize text-foreground/70">{m.service ?? '—'}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{NUM.format(m.calls)}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-foreground/75">{NUM.format(m.tokens)}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-foreground/75">{m.avg_latency_ms}ms</td>
                        <td className="px-6 py-3 text-right font-semibold tabular-nums">{INR.format(m.cost_inr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Glass>
        </motion.div>

        {/* Trend */}
        <motion.div variants={fadeUp}>
          <Glass className="p-6">
            <header className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Daily calls — last 30 days</h2>
              <Activity className="h-4 w-4 text-teal-700 dark:text-teal-300" />
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

      <AnimatePresence>
        {info && <InfoModal info={info} onClose={() => setInfo(null)} />}
      </AnimatePresence>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint, loading, tone = 'neutral', onClick }: {
  icon: typeof Activity; label: string; value: string | number; hint: string; loading: boolean;
  tone?: 'neutral' | 'accent' | 'warning';
  onClick?: () => void;
}) {
  const accent =
    tone === 'warning' ? 'text-amber-700 dark:text-amber-300'
      : tone === 'accent' ? 'text-teal-700 dark:text-teal-300'
      : 'text-foreground/70';
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Glass className="p-6 transition-colors hover:bg-foreground/[0.04]">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">{label}</span>
          <Icon className={`h-4 w-4 ${accent}`} />
        </div>
        <div className="mt-3 text-3xl font-semibold tracking-tight">
          {loading ? <span className="inline-block h-7 w-20 animate-pulse rounded bg-foreground/[0.06]" /> : value}
        </div>
        <div className="mt-1 text-xs text-foreground/65">{hint}</div>
      </Glass>
    </button>
  );
}

function InfoModal({ info, onClose }: { info: InfoContent; onClose: () => void }) {
  const Icon = info.icon;
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-foreground/[0.08] bg-popover shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-foreground/[0.06] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.20)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-300">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold tracking-tight">{info.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-foreground/60 hover:bg-foreground/[0.06] hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="px-5 py-4">
          <p className="text-sm leading-relaxed text-foreground/80">{info.blurb}</p>
          {info.uses && info.uses.length > 0 && (
            <>
              <div className="mt-4 text-[10px] uppercase tracking-[0.16em] text-foreground/45">What it powers</div>
              <ul className="mt-2 space-y-1.5">
                {info.uses.map((u) => (
                  <li key={u} className="flex items-start gap-2 text-sm text-foreground/80">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-teal-500" />
                    <span>{u}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function ProviderBadge({ provider }: { provider: string }) {
  const p = provider.toLowerCase();
  const cls =
    p === 'gemini' ? 'bg-blue-500/15 text-blue-700 dark:text-blue-200'
      : p === 'claude' ? 'bg-orange-500/15 text-orange-700 dark:text-orange-200'
      : p === 'openai' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200'
      : 'bg-foreground/[0.06] text-foreground/60';
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]', cls)}>
      {provider}
    </span>
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
          <div key={d.day} className="flex-1 rounded-sm bg-gradient-to-t from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]"
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