import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Server,
  XCircle,
  Zap,
} from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { adminApi, type PlatformHealth } from '@/modules/super-admin/api/admin';
import { cn } from '@/lib/utils';

export default function AdminHealth() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<PlatformHealth>({
    queryKey: ['admin', 'health'],
    queryFn: () => adminApi.health(),
    refetchInterval: 30_000,
    staleTime: 0,
  });

  const dbOk = data?.database.status === 'up';
  const overallOk = !!data && dbOk;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8 md:py-12">
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-8">
        <motion.div variants={fadeUp} className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/60">
            Platform health
          </span>
          <h1 className="text-balance">Process, database, webhooks.</h1>
          <p className="text-pretty text-base text-foreground/80 dark:text-foreground/65 md:text-lg md:leading-relaxed">
            Live metrics refreshed every 30 seconds.{' '}
            <button onClick={() => refetch()} className="underline hover:text-foreground">Refresh now</button>{' '}
            {isFetching && <span className="text-foreground/55">· fetching…</span>}
          </p>
        </motion.div>

        {/* Top status */}
        <motion.div variants={fadeUp}>
          <Glass className={cn(
            'flex items-center justify-between p-6',
            overallOk ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-rose-400/40 bg-rose-400/5',
          )}>
            <div className="flex items-center gap-3">
              {overallOk
                ? <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                : <XCircle className="h-6 w-6 text-rose-600 dark:text-rose-400" />}
              <div>
                <div className="text-lg font-semibold">
                  {isLoading ? 'Checking…' : overallOk ? 'All systems operational' : 'Degraded service'}
                </div>
                <div className="text-xs text-foreground/65">
                  Environment: <code>{data?.process.env ?? '—'}</code> · Node {data?.process.node_version ?? '—'} · uptime {formatUptime(data?.process.uptime_seconds)}
                </div>
              </div>
            </div>
          </Glass>
        </motion.div>

        {error && (
          <Glass className="border-rose-400/40 bg-rose-400/5 p-4 text-sm text-rose-700 dark:text-rose-200">
            Couldn't read /admin/health: {(error as Error).message}
          </Glass>
        )}

        {/* Cards */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <StatusCard
            icon={Database}
            title="Database"
            status={dbOk ? 'ok' : 'down'}
            primary={dbOk ? `${data?.database.latency_ms ?? '—'} ms` : 'unreachable'}
            secondary={data?.database.version?.slice(0, 80) ?? data?.database.error ?? '—'}
            loading={isLoading}
          />
          <StatusCard
            icon={Cpu}
            title="Process memory"
            status="info"
            primary={data ? `${data.process.memory.rss_mb} MB RSS` : '—'}
            secondary={data ? `${data.process.memory.heap_used_mb} / ${data.process.memory.heap_total_mb} MB heap` : '—'}
            loading={isLoading}
          />
          <StatusCard
            icon={Clock}
            title="Uptime"
            status="info"
            primary={formatUptime(data?.process.uptime_seconds)}
            secondary="since last restart"
            loading={isLoading}
          />
          <StatusCard
            icon={Zap}
            title="Webhooks (24h)"
            status={(data?.webhooks.errors_24h ?? 0) > 0 ? 'warn' : 'ok'}
            primary={data ? `${data.webhooks.events_24h} events` : '—'}
            secondary={data ? `${data.webhooks.errors_24h} errors${data.webhooks.last_event_at ? ` · last ${formatRelative(data.webhooks.last_event_at)}` : ''}` : '—'}
            loading={isLoading}
          />
          <StatusCard
            icon={AlertTriangle}
            title="AI errors (24h)"
            status={(data?.errors_24h.ai_calls ?? 0) > 0 ? 'warn' : 'ok'}
            primary={data ? String(data.errors_24h.ai_calls) : '—'}
            secondary="failed Gemini calls"
            loading={isLoading}
          />
          <StatusCard
            icon={Server}
            title="Integrations"
            status="info"
            primary={data
              ? `${[data.flags.razorpay_configured, data.flags.gemini_configured].filter(Boolean).length} / 2 wired`
              : '—'}
            secondary={data
              ? `Razorpay ${data.flags.razorpay_configured ? '✓' : '○'} · Gemini ${data.flags.gemini_configured ? '✓' : '○'}`
              : '—'}
            loading={isLoading}
          />
        </motion.div>

        <motion.div variants={fadeUp}>
          <Glass className="p-5 text-sm text-foreground/75">
            <strong className="text-foreground">What's next:</strong>{' '}
            Sentry hooks for error stacktraces, BullMQ depth once async jobs land, and request-latency histograms (p50/p95/p99) when we ship a per-route instrumentation layer.
          </Glass>
        </motion.div>
      </motion.div>
    </div>
  );
}

function StatusCard({ icon: Icon, title, status, primary, secondary, loading }: {
  icon: typeof Database; title: string;
  status: 'ok' | 'warn' | 'down' | 'info';
  primary: string; secondary: string; loading: boolean;
}) {
  const colors = {
    ok:   'text-emerald-700 dark:text-emerald-300',
    warn: 'text-amber-700 dark:text-amber-300',
    down: 'text-rose-700 dark:text-rose-300',
    info: 'text-violet-700 dark:text-violet-300',
  }[status];
  return (
    <Glass className="p-6">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">{title}</span>
        <Icon className={`h-4 w-4 ${colors}`} />
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">
        {loading ? <span className="inline-block h-7 w-24 animate-pulse rounded bg-foreground/[0.06]" /> : primary}
      </div>
      <div className="mt-1 text-xs text-foreground/65">{secondary}</div>
    </Glass>
  );
}

function formatUptime(seconds?: number): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}