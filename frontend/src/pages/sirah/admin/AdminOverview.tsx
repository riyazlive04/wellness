import { useEffect, useState, type ComponentType } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, Building2, CreditCard,
  Database, Loader2, Moon, ScrollText, ShieldCheck, Sparkles, Sun,
  Sunrise, Sunset, TrendingUp, Users, Wallet,
} from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { useScope } from '@/hooks/useScope';
import {
  adminApi,
  type PlatformStats,
  type RevenueSnapshot,
  type UsageSnapshot,
} from '@/modules/super-admin/api/admin';
import { verificationApi, type AdminVerification } from '@/modules/workspace/api/verification';
import { cn } from '@/lib/utils';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat('en-IN');

/**
 * Super-Admin landing — restyled to match the owner (nutritionist) dashboard:
 * a gradient hero banner with a live clock, a focal "needs attention" row,
 * a compact KPI strip, Verifications + Subscriptions detail cards, and a
 * quick-actions grid. Every figure still comes from a real endpoint
 * (workspaces/stats, billing/revenue/snapshot, usage/snapshot, verifications).
 */
export default function AdminOverview() {
  const { data: scope } = useScope();
  const navigate = useNavigate();

  // Live ticking clock for the banner.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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
  const verificationsQ = useQuery<AdminVerification[]>({
    queryKey: ['admin', 'verifications', 'overview'],
    queryFn: () => verificationApi.adminList(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const stats = statsQ.data;
  const revenue = revenueQ.data;
  const usage = usageQ.data;

  const verifications = verificationsQ.data ?? [];
  const vCounts = {
    pending:  verifications.filter((v) => v.status === 'pending').length,
    awaiting: verifications.filter((v) => v.status === 'unsubmitted').length,
    verified: verifications.filter((v) => v.status === 'verified').length,
    rejected: verifications.filter((v) => v.status === 'rejected').length,
  };
  const verificationsToReview = verifications
    .filter((v) => v.status === 'pending' || v.status === 'unsubmitted')
    .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1))
    .slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8 md:py-12">
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-8">
        {/* ── Hero banner ──────────────────────────────────────────── */}
        <motion.div variants={fadeUp}>
          <PlatformBanner email={scope?.email ?? '—'} now={now} />
        </motion.div>

        {statsQ.error && (
          <motion.div variants={fadeUp}>
            <Glass className="border-rose-400/40 bg-rose-400/5 p-4 text-sm text-rose-700 dark:text-rose-200">
              Couldn't load platform stats: {(statsQ.error as Error).message}
            </Glass>
          </motion.div>
        )}

        {/* ── Focal row: verifications attention + mini-tiles ──────── */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
          <div className="lg:col-span-2">
            <VerificationFocalCard
              loading={verificationsQ.isLoading}
              pending={vCounts.pending}
              awaiting={vCounts.awaiting}
              onReview={() => navigate('/admin/verifications')}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <MiniTile
              icon={Building2}
              label="Workspaces"
              value={stats ? NUM.format(stats.workspaces.total) : '—'}
              hint={stats ? `${stats.workspaces.active} active · ${stats.workspaces.trial} trial` : 'across the platform'}
              accent="violet"
              onClick={() => navigate('/admin/workspaces')}
            />
            <MiniTile
              icon={Users}
              label="Members"
              value={stats ? NUM.format(stats.members.total) : '—'}
              hint={stats ? `${stats.members.owners} owners` : 'people in workspaces'}
              accent="blue"
              onClick={() => navigate('/admin/users')}
            />
            <MiniTile
              icon={Activity}
              label="New (30 days)"
              value={stats ? NUM.format(stats.workspaces.createdLast30d) : '—'}
              hint="workspaces created"
              accent="emerald"
              onClick={() => navigate('/admin/workspaces')}
            />
          </div>
        </motion.div>

        {/* ── Compact KPI strip ────────────────────────────────────── */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CompactKPI
            icon={Wallet}
            label="MRR"
            value={revenue ? INR.format(revenue.mrr_inr) : '—'}
            sub={revenue ? `ARR ${INR.format(revenue.arr_inr)}` : 'monthly recurring'}
            tone="blue"
            isError={!!revenueQ.error}
          />
          <CompactKPI
            icon={CreditCard}
            label="Active subs"
            value={revenue ? NUM.format(revenue.active_subs) : '—'}
            sub={revenue ? `${revenue.trialing_subs} trialing` : 'paying workspaces'}
            tone="ok"
            isError={!!revenueQ.error}
          />
          <CompactKPI
            icon={Sparkles}
            label="AI usage today"
            value={usage ? NUM.format(usage.last_24h_calls) : '—'}
            sub={usage ? `${NUM.format(usage.last_24h_tokens)} tokens` : 'calls · 24h'}
            tone="violet"
            isError={!!usageQ.error}
          />
          <CompactKPI
            icon={AlertTriangle}
            label="Trials expiring"
            value={stats ? NUM.format(stats.workspaces.trialExpiringSoon) : '—'}
            sub="within 7 days"
            tone={stats && stats.workspaces.trialExpiringSoon > 0 ? 'warning' : 'ok'}
          />
        </motion.div>

        {/* ── Verifications + Subscriptions detail cards ───────────── */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Verifications */}
          <Glass className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                <span className="text-sm font-medium">Verifications</span>
              </div>
              <Link to="/admin/verifications" className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-xs text-foreground/70 transition-colors hover:bg-foreground/[0.06]">
                Review <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
              <MiniStat label="Pending"  value={vCounts.pending}  tone="amber"   loading={verificationsQ.isLoading} />
              <MiniStat label="Awaiting" value={vCounts.awaiting} tone="sky"     loading={verificationsQ.isLoading} />
              <MiniStat label="Verified" value={vCounts.verified} tone="emerald" loading={verificationsQ.isLoading} />
              <MiniStat label="Rejected" value={vCounts.rejected} tone="rose"    loading={verificationsQ.isLoading} />
            </div>

            <div className="flex-1 px-5 pb-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/45">Needs your attention</div>
              {verificationsQ.isLoading ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-foreground/45">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : verificationsToReview.length === 0 ? (
                <div className="mt-2 text-sm text-foreground/55">Nothing waiting — all caught up.</div>
              ) : (
                <ul className="mt-1 divide-y divide-foreground/[0.05]">
                  {verificationsToReview.map((v) => (
                    <li key={v.workspace_id}>
                      <Link
                        to="/admin/verifications"
                        className="flex items-center justify-between gap-2 py-2 text-sm transition-colors hover:text-foreground"
                      >
                        <span className="min-w-0 flex-1 truncate text-foreground/85">
                          {v.workspace_name || v.legal_name || 'Workspace'}
                        </span>
                        <VStatusChip status={v.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Glass>

          {/* Subscriptions */}
          <Glass className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-violet-700 dark:text-violet-300" />
                <span className="text-sm font-medium">Subscriptions</span>
              </div>
              <Link to="/admin/subscriptions" className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-xs text-foreground/70 transition-colors hover:bg-foreground/[0.06]">
                View all <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
              <MiniStat label="Active"    value={revenue?.active_subs}   tone="emerald" loading={revenueQ.isLoading} isError={!!revenueQ.error} />
              <MiniStat label="Trialing"  value={revenue?.trialing_subs} tone="sky"     loading={revenueQ.isLoading} isError={!!revenueQ.error} />
              <MiniStat label="Past due"  value={revenue?.past_due_subs} tone="rose"    loading={revenueQ.isLoading} isError={!!revenueQ.error} />
              <MiniStat label="Cancelled" value={revenue?.cancelled_30d} tone="neutral" loading={revenueQ.isLoading} isError={!!revenueQ.error} hint="30d" />
            </div>

            <div className="mt-auto flex flex-wrap items-end gap-x-6 gap-y-2 border-t border-foreground/[0.06] px-5 py-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/45">MRR</div>
                <div className="text-xl font-semibold tabular-nums">{revenue ? INR.format(revenue.mrr_inr) : '—'}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/45">ARR</div>
                <div className="text-xl font-semibold tabular-nums">{revenue ? INR.format(revenue.arr_inr) : '—'}</div>
              </div>
              {!!revenue?.failed_payments && (
                <div className="ml-auto text-xs text-rose-600 dark:text-rose-300">
                  {revenue.failed_payments} failed payment{revenue.failed_payments === 1 ? '' : 's'}
                </div>
              )}
            </div>
          </Glass>
        </motion.div>

        {/* ── Quick actions ────────────────────────────────────────── */}
        <motion.div variants={fadeUp}>
          <div className="mb-3 text-xs uppercase tracking-[0.18em] text-foreground/55">Jump to</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <QuickAction icon={Building2}   label="Workspaces"  onClick={() => navigate('/admin/workspaces')} />
            <QuickAction icon={Users}       label="Users"       onClick={() => navigate('/admin/users')} />
            <QuickAction icon={CreditCard}  label="Billing"     onClick={() => navigate('/admin/billing')} />
            <QuickAction icon={TrendingUp}  label="Revenue"     onClick={() => navigate('/admin/revenue')} />
            <QuickAction icon={ScrollText}  label="Audit log"   onClick={() => navigate('/admin/audit')} />
            <QuickAction icon={Database}    label="Health"      onClick={() => navigate('/admin/health')} />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PlatformBanner — gradient hero with greeting + live clock.
// ─────────────────────────────────────────────────────────────────────────

function PlatformBanner({ email, now }: { email: string; now: Date }) {
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-foreground/[0.06] p-6 md:p-8"
      style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(217,70,239,0.12) 55%, transparent 100%)' }}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(217,70,239,0.22), transparent 70%)' }}
      />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div
            className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-2xl ring-1 ring-inset ring-white/30"
            style={{ background: 'linear-gradient(135deg, #6366f1, #d946ef)' }}
          >
            <ShieldCheck className="h-7 w-7 text-white" />
          </div>
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-foreground/[0.08] bg-foreground/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/65">
              <GreetingIcon className="h-3.5 w-3.5 text-amber-500 dark:text-amber-300" />
              {greetingPart()} · Platform admin
            </span>
            <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              SIRAH Platform.
            </h1>
            <p className="mt-1.5 truncate text-sm text-foreground/65">
              Signed in as <span className="font-medium text-foreground">{email}</span> · full access to every workspace and user.
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-col items-start gap-1.5 md:items-end">
          <div className="text-3xl font-semibold tabular-nums tracking-tight md:text-4xl">{time}</div>
          <div className="text-xs text-foreground/60">{date}</div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/[0.08] px-3 py-1 text-[11px] text-emerald-700 dark:text-emerald-300">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// VerificationFocalCard — "what needs attention", mirrors the owner FocalCard.
// ─────────────────────────────────────────────────────────────────────────

function VerificationFocalCard({
  loading, pending, awaiting, onReview,
}: {
  loading: boolean;
  pending: number;
  awaiting: number;
  onReview: () => void;
}) {
  const allClear = pending === 0;

  return (
    <Glass className="relative h-full overflow-hidden p-0">
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent',
          allClear ? 'from-emerald-500/8' : 'from-amber-500/8',
        )}
      />
      <div
        className={cn(
          'absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-gradient-to-b to-transparent',
          allClear ? 'from-emerald-500' : 'from-amber-500',
        )}
      />

      <div className="relative p-6">
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em]',
            allClear
              ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200'
              : 'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200',
          )}
        >
          <ShieldCheck className="h-3 w-3" />
          {allClear ? 'All caught up' : 'Needs review'}
        </span>

        {loading ? (
          <div className="mt-8 flex items-center gap-2 text-sm text-foreground/55">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the verification queue…
          </div>
        ) : pending > 0 ? (
          <>
            <p className="mt-5 text-2xl font-semibold tracking-tight">
              {pending} {pending === 1 ? 'verification needs' : 'verifications need'} your decision.
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/70">
              {awaiting > 0
                ? `Plus ${awaiting} ${awaiting === 1 ? 'workspace' : 'workspaces'} awaiting submission. `
                : ''}
              Approve or reject submitted practitioner credentials to keep the platform trusted.
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={onReview}
                className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.02]"
              >
                Review submissions
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </>
        ) : awaiting > 0 ? (
          <>
            <p className="mt-5 text-lg font-semibold tracking-tight">Nothing to decide right now.</p>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/70">
              {awaiting} {awaiting === 1 ? 'workspace is' : 'workspaces are'} awaiting submission — they'll appear
              for review once their owners submit credentials.
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={onReview}
                className="inline-flex items-center gap-2 rounded-full border border-foreground/10 px-4 py-2.5 text-sm text-foreground/85 hover:bg-foreground/[0.04]"
              >
                Open verification queue
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-5 text-lg font-semibold tracking-tight">Verification queue is clear.</p>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/70">
              No submissions are waiting. New workspaces will show up here automatically as they sign up.
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={onReview}
                className="inline-flex items-center gap-2 rounded-full border border-foreground/10 px-4 py-2.5 text-sm text-foreground/85 hover:bg-foreground/[0.04]"
              >
                Open verification queue
              </button>
            </div>
          </>
        )}
      </div>
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MiniTile — compact stat tile for the focal column.
// ─────────────────────────────────────────────────────────────────────────

type Accent = 'amber' | 'violet' | 'blue' | 'emerald';

const MINI_ACCENT: Record<Accent, string> = {
  amber:   'text-amber-600 dark:text-amber-300',
  violet:  'text-violet-600 dark:text-violet-300',
  blue:    'text-blue-600 dark:text-blue-300',
  emerald: 'text-emerald-600 dark:text-emerald-300',
};

function MiniTile({ icon: Icon, label, value, hint, accent, onClick }: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  accent: Accent;
  onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="group relative h-full text-left">
      <Glass className="h-full p-4 transition-all group-hover:bg-foreground/[0.04]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</span>
          <Icon className={cn('h-3.5 w-3.5', MINI_ACCENT[accent])} strokeWidth={1.8} />
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        {hint && <div className="mt-0.5 text-[11px] text-foreground/55">{hint}</div>}
      </Glass>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// CompactKPI — small KPI tile for the ambient strip.
// ─────────────────────────────────────────────────────────────────────────

type KPITone = 'ok' | 'violet' | 'blue' | 'warning';

const KPI_TONE: Record<KPITone, string> = {
  ok:      'text-emerald-600 dark:text-emerald-300',
  violet:  'text-violet-600 dark:text-violet-300',
  blue:    'text-blue-600 dark:text-blue-300',
  warning: 'text-amber-600 dark:text-amber-300',
};

function CompactKPI({ icon: Icon, label, value, sub, tone, isError }: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone: KPITone;
  isError?: boolean;
}) {
  return (
    <Glass className="p-4">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-3.5 w-3.5', KPI_TONE[tone])} strokeWidth={1.8} />
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
        {isError ? <span className="text-foreground/30">—</span> : value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-foreground/55">{sub}</div>}
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MiniStat — tiny count cell used inside the detail cards.
// ─────────────────────────────────────────────────────────────────────────

const MINI_STAT_TONES: Record<string, string> = {
  amber:   'text-amber-700 dark:text-amber-300',
  sky:     'text-sky-700 dark:text-sky-300',
  emerald: 'text-emerald-700 dark:text-emerald-300',
  rose:    'text-rose-700 dark:text-rose-300',
  neutral: 'text-foreground/85',
};

function MiniStat({ label, value, tone, loading, isError, hint }: {
  label: string;
  value: number | undefined;
  tone: keyof typeof MINI_STAT_TONES;
  loading: boolean;
  isError?: boolean;
  hint?: string;
}) {
  let content: React.ReactNode;
  if (isError) content = <span className="text-foreground/30">—</span>;
  else if (loading) content = <span className="text-foreground/30">…</span>;
  else if (value === undefined || value === null) content = <span className="text-foreground/30">—</span>;
  else content = value;
  return (
    <div className="rounded-xl bg-foreground/[0.03] px-3 py-2.5">
      <div className={cn('text-2xl font-semibold leading-none tabular-nums', MINI_STAT_TONES[tone])}>{content}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-foreground/55">
        {label}{hint ? ` · ${hint}` : ''}
      </div>
    </div>
  );
}

function VStatusChip({ status }: { status: AdminVerification['status'] }) {
  const meta = status === 'pending'
    ? { label: 'Pending', cls: 'bg-amber-400/15 text-amber-700 dark:text-amber-200' }
    : { label: 'Awaiting', cls: 'bg-sky-400/15 text-sky-700 dark:text-sky-200' };
  return (
    <span className={cn('flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]', meta.cls)}>
      {meta.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// QuickAction — icon button matching the owner dashboard.
// ─────────────────────────────────────────────────────────────────────────

function QuickAction({ icon: Icon, label, onClick }: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] px-4 py-3 text-left transition-all hover:-translate-y-px hover:bg-foreground/[0.05]"
    >
      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-violet-700 transition-colors group-hover:from-violet-500/25 group-hover:to-emerald-400/25 dark:text-violet-300">
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function greetingPart(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function GreetingIcon({ className }: { className?: string }) {
  const h = new Date().getHours();
  if (h < 5) return <Moon className={className} />;
  if (h < 12) return <Sunrise className={className} />;
  if (h < 17) return <Sun className={className} />;
  if (h < 21) return <Sunset className={className} />;
  return <Moon className={className} />;
}
