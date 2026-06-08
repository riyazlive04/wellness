import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Building2, Users, CreditCard, Sparkles, Activity, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Glass, fadeUp, stagger } from '@/design-system';
import { useScope } from '@/hooks/useScope';
import {
  adminApi,
  type PlatformStats,
  type RevenueSnapshot,
  type UsageSnapshot,
} from '@/modules/super-admin/api/admin';

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const NUM = new Intl.NumberFormat('en-IN');

/**
 * Super-Admin landing — every tile pulls from a real endpoint.
 *
 *   Workspaces / Members / New (30d) / Trials → /admin/workspaces/stats
 *   MRR                                       → /admin/billing/revenue/snapshot
 *   AI usage today                            → /admin/usage/snapshot
 *
 * Each query uses retry: 1 so backend errors (missing migration, broken
 * SQL, etc.) surface inside ~5s instead of being buried under 3 retries
 * × exponential backoff. The default 3-retry policy is for transient
 * network blips, not for "the table doesn't exist."
 *
 * Failures on billing or usage are NOT escalated to a banner — those
 * tiles show "—" silently so a missing billing migration doesn't block
 * the rest of the dashboard from rendering. Only the workspace stats
 * query (the platform's bread and butter) escalates to a red banner.
 */
export default function AdminOverview() {
  const { data: scope } = useScope();

  const statsQ = useQuery<PlatformStats>({
    queryKey: ['admin', 'platform-stats'],
    queryFn: () => adminApi.stats(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const revenueQ = useQuery<RevenueSnapshot>({
    queryKey: ['admin', 'revenue', 'snapshot'],
    queryFn: () => adminApi.revenueSnapshot(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const usageQ = useQuery<UsageSnapshot>({
    queryKey: ['admin', 'usage', 'snapshot'],
    queryFn: () => adminApi.usageSnapshot(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const stats = statsQ.data;
  const revenue = revenueQ.data;
  const usage = usageQ.data;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8 md:py-12">
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="space-y-10"
      >
        <motion.div variants={fadeUp} className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/60">
            Platform overview
          </span>
          <h1 className="text-balance">SIRAH Platform · all workspaces.</h1>
          <p className="text-pretty text-base text-foreground/80 dark:text-foreground/65 md:text-lg md:leading-relaxed">
            Signed in as <span className="font-medium text-foreground">{scope?.email ?? '—'}</span>.
            You have super admin access to the entire SIRAH LIFE ecosystem.
          </p>
        </motion.div>

        {statsQ.error && (
          <Glass className="border-rose-400/40 bg-rose-400/5 p-4 text-sm text-rose-700 dark:text-rose-200">
            Couldn't load platform stats: {(statsQ.error as Error).message}
          </Glass>
        )}

        <motion.div
          variants={fadeUp}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <KpiTile
            icon={Building2}
            label="Workspaces"
            value={stats?.workspaces.total}
            isLoading={statsQ.isLoading}
            hint={stats
              ? `${stats.workspaces.active} active · ${stats.workspaces.suspended} suspended · ${stats.workspaces.trial} trial`
              : 'active · suspended · trial'}
          />
          <KpiTile
            icon={Users}
            label="Members"
            value={stats?.members.total}
            isLoading={statsQ.isLoading}
            hint={stats ? `${stats.members.owners} owners + ${stats.members.total - stats.members.owners} other roles` : '—'}
          />
          <KpiTile
            icon={Activity}
            label="New (last 30 days)"
            value={stats?.workspaces.createdLast30d}
            isLoading={statsQ.isLoading}
            hint="workspaces created"
          />
          <KpiTile
            icon={AlertTriangle}
            label="Trials expiring"
            value={stats?.workspaces.trialExpiringSoon}
            isLoading={statsQ.isLoading}
            hint="within next 7 days"
            tone={stats && stats.workspaces.trialExpiringSoon > 0 ? 'warning' : 'neutral'}
          />
          <KpiTile
            icon={CreditCard}
            label="MRR"
            value={revenue ? INR.format(revenue.mrr_inr) : undefined}
            isLoading={revenueQ.isLoading}
            isError={!!revenueQ.error}
            hint={revenue ? `ARR ${INR.format(revenue.arr_inr)} · ${revenue.active_subs} active subs` : 'monthly recurring · billing'}
          />
          <KpiTile
            icon={Sparkles}
            label="AI usage today"
            value={usage ? NUM.format(usage.last_24h_calls) : undefined}
            isLoading={usageQ.isLoading}
            isError={!!usageQ.error}
            hint={usage
              ? `${NUM.format(usage.last_24h_tokens)} tokens · ${INR.format(usage.last_24h_cost_inr)} spend`
              : 'calls in the last 24 hours'}
          />
        </motion.div>

        <motion.div variants={fadeUp}>
          <Glass className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Quick links</h2>
              <Link
                to="/admin/workspaces"
                className="rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-1.5 text-xs font-medium text-white transition-transform hover:scale-[1.02]"
              >
                View all workspaces →
              </Link>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm text-foreground/70">
              <li>• <Link to="/admin/workspaces" className="font-medium hover:underline">Workspaces</Link> — see, search, suspend, activate, or soft-delete any workspace</li>
              <li>• <Link to="/admin/subscriptions" className="font-medium hover:underline">Subscriptions</Link> — every paying workspace, plan, status</li>
              <li>• <Link to="/admin/billing" className="font-medium hover:underline">Billing</Link> — payments, refunds, GST invoices, dunning</li>
              <li>• <Link to="/admin/ai-usage" className="font-medium hover:underline">AI usage</Link> — per-workspace token / image / minute spend</li>
              <li>• <Link to="/admin/audit" className="font-medium hover:underline">Audit log</Link> — every super-admin action recorded</li>
              <li>• <Link to="/admin/health" className="font-medium hover:underline">Platform health</Link> — DB latency, memory, webhook errors</li>
            </ul>
          </Glass>
        </motion.div>
      </motion.div>
    </div>
  );
}

interface KpiTileProps {
  icon: typeof Building2;
  label: string;
  /** number for counts, string for pre-formatted (currency, etc.). */
  value: number | string | undefined;
  isLoading: boolean;
  hint: string;
  tone?: 'neutral' | 'warning';
  /** If the query failed, render a muted "—" instead of pretending to load forever. */
  isError?: boolean;
}

function KpiTile({ icon: Icon, label, value, isLoading, hint, tone = 'neutral', isError }: KpiTileProps) {
  const accent = tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-violet-700 dark:text-violet-300';

  // Decide what to show in the value slot.
  // - error           → muted "—"
  // - loading         → pulsing dots (kept subtle so the page doesn't strobe)
  // - undefined value → muted "—" (no data but no error either)
  // - real value      → render as is
  let content: React.ReactNode;
  if (isError) {
    content = <span className="text-foreground/30">—</span>;
  } else if (isLoading) {
    content = <span className="text-foreground/30">…</span>;
  } else if (value === undefined || value === null) {
    content = <span className="text-foreground/30">—</span>;
  } else {
    content = value;
  }

  return (
    <Glass className="p-6">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">{label}</span>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      <div className="mt-4 text-4xl font-semibold leading-none tracking-tight tabular-nums">
        {content}
      </div>
      <div className="mt-1.5 text-xs text-foreground/75 dark:text-foreground/60">{hint}</div>
    </Glass>
  );
}