import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Building2, Users, CreditCard, Sparkles, Activity, Server, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Glass, fadeUp, stagger } from '@/design-system';
import { useScope } from '@/hooks/useScope';
import { adminApi, type PlatformStats } from '@/modules/super-admin/api/admin';

/**
 * Super Admin landing — real KPIs pulled from /api/v1/admin/workspaces/stats.
 * Anything we can't compute yet (MRR, AI usage) stays as a placeholder tile
 * with a clear "—" so the surface doesn't look broken; we'll wire those once
 * billing + usage-tracking modules land.
 */
export default function AdminOverview() {
  const { data: scope } = useScope();
  const { data: stats, isLoading, error } = useQuery<PlatformStats>({
    queryKey: ['admin', 'platform-stats'],
    queryFn: () => adminApi.stats(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8 md:py-12">
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="space-y-10"
      >
        <motion.div variants={fadeUp} className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/60">
            Platform overview
          </span>
          <h1 className="text-balance">SIRAH Platform · all workspaces.</h1>
          <p className="text-pretty text-base text-foreground/65 md:text-lg md:leading-relaxed">
            Signed in as <span className="font-medium text-foreground">{scope?.email ?? '—'}</span>.
            You have super admin access to the entire SIRAH LIFE ecosystem.
          </p>
        </motion.div>

        {error && (
          <Glass className="border-rose-400/40 bg-rose-400/5 p-4 text-sm text-rose-700 dark:text-rose-200">
            Couldn't load platform stats: {(error as Error).message}
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
            isLoading={isLoading}
            hint={stats
              ? `${stats.workspaces.active} active · ${stats.workspaces.suspended} suspended · ${stats.workspaces.trial} trial`
              : 'active · suspended · trial'}
          />
          <KpiTile
            icon={Users}
            label="Members"
            value={stats?.members.total}
            isLoading={isLoading}
            hint={stats ? `${stats.members.owners} owners + ${stats.members.total - stats.members.owners} other roles` : '—'}
          />
          <KpiTile
            icon={Activity}
            label="New (last 30 days)"
            value={stats?.workspaces.createdLast30d}
            isLoading={isLoading}
            hint="workspaces created"
          />
          <KpiTile
            icon={AlertTriangle}
            label="Trials expiring"
            value={stats?.workspaces.trialExpiringSoon}
            isLoading={isLoading}
            hint="within next 7 days"
            tone={stats && stats.workspaces.trialExpiringSoon > 0 ? 'warning' : 'neutral'}
          />
          <PlaceholderTile icon={CreditCard} label="MRR"              hint="wires up with billing module" />
          <PlaceholderTile icon={Sparkles}   label="AI usage today"   hint="wires up with usage tracking" />
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
              <li>• <strong>Workspaces</strong> — see, search, suspend, activate, or soft-delete any workspace</li>
              <li>• Subscriptions (coming next) — payment status, GST invoices, failed-payment recovery</li>
              <li>• AI usage analytics (coming next) — per-workspace token / image / minute spend</li>
              <li>• Audit log (coming next) — every super-admin action recorded</li>
              <li>• Platform health (coming next) — API latency, Postgres conn pool, worker queues</li>
            </ul>
          </Glass>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Server className="hidden" /> {/* keep the icon imported for the placeholder; harmless */}
        </motion.div>
      </motion.div>
    </div>
  );
}

interface KpiTileProps {
  icon: typeof Building2;
  label: string;
  value: number | undefined;
  isLoading: boolean;
  hint: string;
  tone?: 'neutral' | 'warning';
}

function KpiTile({ icon: Icon, label, value, isLoading, hint, tone = 'neutral' }: KpiTileProps) {
  const accent = tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-violet-700 dark:text-violet-300';
  return (
    <Glass className="p-6">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/55">{label}</span>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      <div className="mt-4 text-4xl font-semibold leading-none tracking-tight tabular-nums">
        {isLoading ? <span className="text-foreground/30">…</span> : value ?? <span className="text-foreground/30">—</span>}
      </div>
      <div className="mt-1.5 text-xs text-foreground/60">{hint}</div>
    </Glass>
  );
}

function PlaceholderTile({
  icon: Icon,
  label,
  hint,
}: {
  icon: typeof Building2;
  label: string;
  hint: string;
}) {
  return (
    <Glass className="p-6 opacity-70">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/55">{label}</span>
        <Icon className="h-4 w-4 text-foreground/40" />
      </div>
      <div className="mt-4 text-4xl font-semibold leading-none tracking-tight tabular-nums text-foreground/35">
        —
      </div>
      <div className="mt-1.5 text-xs text-foreground/50">{hint}</div>
    </Glass>
  );
}
