import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users,
  Activity,
  Sparkles,
  MessageCircle,
  Camera,
  TrendingUp,
  Flame,
  Trophy,
} from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { TrendChart } from '@/modules/workspace/analytics/components/TrendChart';
import { Heatmap } from '@/modules/workspace/analytics/components/Heatmap';
import { DistributionBars } from '@/modules/workspace/analytics/components/DistributionBars';
import { Donut } from '@/modules/workspace/analytics/components/Donut';
import {
  AI_USAGE,
  COMPLIANCE_DISTRIBUTION,
  HEATMAP_MAX,
  MOCK_HEATMAP,
  PROGRAM_PERFORMANCE,
  TOP_PERFORMERS,
  sliceSeries,
} from '@/modules/workspace/analytics/data/mockAnalytics';
import type { TimeRange } from '@/modules/workspace/analytics/types';
import { cn } from '@/lib/utils';

export default function OwnerAnalytics() {
  const workspace = readWorkspace();
  const [range, setRange] = useState<TimeRange>('30d');

  const series = useMemo(() => sliceSeries(range), [range]);

  // KPI totals + deltas
  const totals = useMemo(() => {
    const half = Math.floor(series.length / 2);
    const recent = series.slice(half);
    const prior  = series.slice(0, half);
    const sum = (arr: typeof series, k: keyof typeof series[number]) =>
      arr.reduce((a, p) => a + (p[k] as number), 0);
    const avg = (arr: typeof series, k: keyof typeof series[number]) =>
      arr.length ? sum(arr, k) / arr.length : 0;

    return {
      activeNow: series[series.length - 1]?.activeClients ?? 0,
      activeDelta: pctDelta(avg(recent, 'activeClients'), avg(prior, 'activeClients')),
      aiCalls:    sum(series, 'aiCalls'),
      aiDelta:    pctDelta(sum(recent, 'aiCalls'), sum(prior, 'aiCalls')),
      msgs:       sum(series, 'messagesSent'),
      msgsDelta:  pctDelta(sum(recent, 'messagesSent'), sum(prior, 'messagesSent')),
      compliance: Math.round(avg(series, 'complianceAvg')),
      complianceDelta: pctDelta(avg(recent, 'complianceAvg'), avg(prior, 'complianceAvg')),
    };
  }, [series]);

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={`Window: last ${range}`}
      onSignOut={() => toast('Sign-out wiring lands with the auth context refactor.')}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-white/40">Analytics</span>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
                The story of your practice
              </h1>
              <p className="mt-1 text-sm text-white/55">
                Engagement, momentum, and where clients need a nudge.
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
              {(['7d', '30d', '90d'] as TimeRange[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                    range === r
                      ? 'bg-gradient-to-br from-blue-600/40 to-fuchsia-500/30 text-white'
                      : 'text-white/55 hover:text-white/85',
                  )}
                >
                  {r === '7d' ? '7 days' : r === '30d' ? '30 days' : '90 days'}
                </button>
              ))}
            </div>
          </motion.div>

          {/* AI insight banner */}
          <motion.div variants={fadeUp}>
            <AIGlow intensity="soft" animated>
              <Glass variant="heavy" className="p-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20">
                    <Sparkles className="h-4 w-4 text-indigo-200" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-indigo-300">
                      SIRAH read
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-white/85">
                      Engagement is up {Math.abs(totals.activeDelta)}% vs. the previous period and your
                      heaviest activity windows are <b>weekday mornings (7–10 AM)</b> and
                      <b> evenings (19–21)</b>. Tuesday/Thursday at 7:30 PM would land best for live
                      group sessions.
                    </p>
                  </div>
                </div>
              </Glass>
            </AIGlow>
          </motion.div>

          {/* KPI strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard
              icon={Users}
              label="Active today"
              value={String(totals.activeNow)}
              delta={deltaChip(totals.activeDelta)}
              hint={`avg this ${range}`}
              accent="sage"
            />
            <KPICard
              icon={Activity}
              label="Adherence"
              value={`${totals.compliance}%`}
              delta={deltaChip(totals.complianceDelta)}
              hint="rolling avg"
              accent="sage"
            />
            <KPICard
              icon={Sparkles}
              label="AI calls"
              value={totals.aiCalls.toLocaleString('en-IN')}
              delta={deltaChip(totals.aiDelta)}
              hint={`this ${range}`}
              accent="indigo"
            />
            <KPICard
              icon={MessageCircle}
              label="Messages"
              value={totals.msgs.toLocaleString('en-IN')}
              delta={deltaChip(totals.msgsDelta)}
              hint="sent + received"
              accent="indigo"
            />
          </motion.div>

          {/* Engagement trend chart */}
          <motion.div variants={fadeUp}>
            <Glass className="p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                    Daily active clients
                  </div>
                  <div className="text-sm font-medium text-white">
                    {totals.activeNow} today
                    <span className={cn('ml-2 text-xs', totals.activeDelta >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                      {totals.activeDelta >= 0 ? '+' : ''}
                      {totals.activeDelta}% vs prior
                    </span>
                  </div>
                </div>
                <TrendingUp className="h-4 w-4 text-white/40" />
              </div>
              <TrendChart
                series={series.map((p) => ({
                  label: new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                  value: p.activeClients,
                }))}
                accent="sage"
                xLabelCount={6}
              />
            </Glass>
          </motion.div>

          {/* 2-col: AI usage donut + Compliance distribution */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Glass className="p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                    AI usage breakdown
                  </div>
                  <div className="text-sm font-medium text-white">By feature, this {range}</div>
                </div>
                <Camera className="h-4 w-4 text-white/40" />
              </div>
              <Donut slices={AI_USAGE} />
            </Glass>

            <Glass className="p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                    Compliance distribution
                  </div>
                  <div className="text-sm font-medium text-white">
                    {COMPLIANCE_DISTRIBUTION.reduce((a, b) => a + b.count, 0)} clients · last week
                  </div>
                </div>
              </div>
              <DistributionBars bands={COMPLIANCE_DISTRIBUTION} />
              <div className="mt-4 text-[11px] text-white/45">
                Three clients sit below the 50% band — consider a check-in nudge from Messaging.
              </div>
            </Glass>
          </motion.div>

          {/* Heatmap */}
          <motion.div variants={fadeUp}>
            <Glass className="p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                    Activity heatmap
                  </div>
                  <div className="text-sm font-medium text-white">
                    When clients log, message, and check in
                  </div>
                </div>
                <Flame className="h-4 w-4 text-white/40" />
              </div>
              <Heatmap grid={MOCK_HEATMAP} max={HEATMAP_MAX} />
            </Glass>
          </motion.div>

          {/* Programs + Top performers */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
            <Glass className="p-5 md:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                    Program performance
                  </div>
                  <div className="text-sm font-medium text-white">Completion vs adherence</div>
                </div>
              </div>
              <ul className="space-y-4">
                {PROGRAM_PERFORMANCE.map((p) => (
                  <li key={p.name}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-white/85">{p.name}</span>
                      <span className="text-[11px] tabular-nums text-white/55">
                        {p.enrolled} {p.enrolled === 1 ? 'client' : 'clients'}
                      </span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-[1fr_140px] items-center gap-3">
                      <div className="space-y-1">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${p.completion}%` }}
                            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                            className="h-full rounded-full bg-gradient-to-r from-blue-600 to-fuchsia-500"
                          />
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${p.adherence}%` }}
                            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                            className="h-full rounded-full bg-emerald-400/70"
                          />
                        </div>
                      </div>
                      <div className="text-right text-[11px] tabular-nums">
                        <div className="text-white/85">{p.completion}% completion</div>
                        <div className="text-emerald-300/80">{p.adherence}% adherence</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex items-center gap-3 text-[10px] text-white/45">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-gradient-to-r from-blue-600 to-fuchsia-500" />
                  Completion
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
                  Adherence
                </span>
              </div>
            </Glass>

            <Glass className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                    Top performers
                  </div>
                  <div className="text-sm font-medium text-white">This {range}</div>
                </div>
                <Trophy className="h-4 w-4 text-amber-300/80" />
              </div>
              <ul className="divide-y divide-white/[0.04]">
                {TOP_PERFORMERS.map((p, i) => (
                  <li key={p.clientId}>
                    <Link
                      to={`/clients/${p.clientId}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.03]"
                    >
                      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center text-xs font-medium tabular-nums text-white/40">
                        {i + 1}
                      </div>
                      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-xs font-medium">
                        {initialsOf(p.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-white">{p.name}</div>
                        <div className="truncate text-[11px] text-white/45">{p.program}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-emerald-300 tabular-nums">
                          {p.compliance}%
                        </div>
                        <div className="text-[10px] text-white/40">{p.streak}d streak</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Glass>
          </motion.div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function pctDelta(now: number, prior: number): number {
  if (prior === 0) return 0;
  return Math.round(((now - prior) / prior) * 100);
}

function deltaChip(pct: number): { value: string; direction: 'up' | 'down' | 'flat' } {
  if (pct === 0) return { value: '0%', direction: 'flat' };
  if (pct > 0)   return { value: `+${pct}%`, direction: 'up' };
  return { value: `${pct}%`, direction: 'down' };
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

interface WorkspaceSummary {
  practiceName: string;
  ownerName: string;
  initials: string;
}

function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }

  const initials = practiceName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'SL';

  return { practiceName, ownerName, initials };
}
