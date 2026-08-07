import { useEffect, useState, type ComponentType } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Brain,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardCheck,
  CreditCard,
  Inbox,
  Info,
  Loader2,
  Mic,
  Moon,
  Plus,
  ShieldCheck,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { Sheet } from '@/components/Sheet';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { AIInsight } from '@/modules/workspace/components/AIInsight';
import { useOwnerIdentity } from '@/hooks/useOwnerIdentity';
import { useWorkspaceBrand } from '@/lib/workspaceBrand';
import { analyticsApi } from '@/modules/workspace/api/analytics';
import { clientsApi, clientSlug, type ClientListItem, type RecentAssessment } from '@/modules/workspace/api/clients';
import { workspacesApi } from '@/modules/workspace/api/workspaces';
import { programEngineApi } from '@/modules/workspace/api/programEngine';
import { plateVisionApi, type ReviewQueueItem } from '@/modules/workspace/api/plate-vision';
import { billingApi, type CurrentSubscription } from '@/modules/workspace/billing/api';
import { useScope } from '@/hooks/useScope';
import { optimistic } from '@/lib/optimistic';
import { cn } from '@/lib/utils';
import { quoteOfTheDay } from '@/lib/quotes';

/**
 * Owner overview — bento layout driven entirely by real workspace data.
 *
 *   1. Greeting hero        (owner's real name + date)
 *   2. Focal row            (needs-attention card + 3 live MiniTiles)
 *   3. Compact KPI strip    (4 tiles from analytics/overview)
 *   4. AI insight           (real text from analytics/insights)
 *   5. Recent clients + This week summary
 *   6. Quick actions
 *
 * No mock names or numbers: every figure comes from analyticsApi.overview(),
 * clientsApi.list(), or workspacesApi.me(). Panels with no value show an
 * honest empty state rather than fabricated content.
 */

export default function OwnerOverview() {
  const { firstName, ownerName } = useOwnerIdentity();
  const navigate = useNavigate();

  const wsQ = useQuery({ queryKey: ['workspace', 'me'], queryFn: workspacesApi.me });
  const kpiQ = useQuery({ queryKey: ['analytics', 'overview'], queryFn: analyticsApi.overview });
  const clientsQ = useQuery({ queryKey: ['clients', 'recent'], queryFn: () => clientsApi.list({ limit: 5 }) });
  const insightQ = useQuery({
    queryKey: ['analytics', 'insights'],
    queryFn: analyticsApi.insights,
    staleTime: 5 * 60 * 1000,
  });
  const pendingQ = useQuery({
    queryKey: ['plates', 'review', 'pending'],
    queryFn: () => plateVisionApi.reviewQueue({ status: 'pending', limit: 5 }),
  });
  // Dedicated server-side at-risk (computed over ALL clients, not just a 50-row
  // page fetched to the browser) — lighter payload + correct for big practices.
  const atRiskQ = useQuery({ queryKey: ['analytics', 'at-risk'], queryFn: () => analyticsApi.atRisk() });
  const recentAssessQ = useQuery({
    queryKey: ['assessments', 'recent'],
    queryFn: () => clientsApi.recentAssessments(6),
  });
  const { data: scope } = useScope();
  const isOwner = scope?.workspaceRole === 'owner' || !!scope?.isSuperAdmin;
  // Billing is owner-only on the backend now — only owners fetch it.
  const billingQ = useQuery({ queryKey: ['billing', 'subscription'], queryFn: billingApi.currentSubscription, enabled: isOwner });
  const programsAQ = useQuery({ queryKey: ['programs', 'analytics'], queryFn: programEngineApi.analytics });
  const { logoUrl, palette } = useWorkspaceBrand();

  // Live ticking clock for the banner (re-renders every second).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const ws = wsQ.data;
  const k = kpiQ.data;
  const clients = clientsQ.data?.items ?? [];
  const pending = pendingQ.data ?? [];
  const atRisk = atRiskQ.data ?? [];
  const recentAssessments = recentAssessQ.data ?? [];
  const subscription = billingQ.data?.subscription ?? null;

  const practiceName = ws?.display_name || ws?.name || 'Your practice';
  const initials = initialsOf(practiceName);
  const trialDays = ws?.trial_ends_at ? daysUntil(ws.trial_ends_at) : null;
  const inactiveCount = k ? Math.max(0, k.total_clients - k.active_7d) : 0;
  const aiInsight = insightQ.data?.insights?.trim();
  const quote = ws?.dashboard_quote?.trim() || dailyQuote();

  // Onboarding checklist — shown until every step is done.
  const setupSteps: SetupStep[] = [
    { label: 'Add your practice logo', done: !!logoUrl, to: '/settings' },
    { label: 'Set your contact email', done: !!ws?.contact_email, to: '/settings' },
    { label: 'Invite your first client', done: (k?.total_clients ?? 0) > 0, to: '/clients' },
    { label: 'Create your first program', done: (programsAQ.data?.total_templates ?? 0) > 0, to: '/programs' },
  ];
  const setupReady = !wsQ.isLoading && !kpiQ.isLoading && !programsAQ.isLoading;
  const setupDone = setupSteps.every((s) => s.done);

  // Clinical dashboard: "this week" progress tiles + AI next-step list, from real data.
  const progressTiles: Array<{ icon: ComponentType<{ className?: string }>; label: string; value: string }> = k
    ? [
        { icon: Users, label: 'New', value: String(k.new_clients_month) },
        { icon: Activity, label: 'Active', value: String(k.active_7d) },
        { icon: CheckCircle2, label: 'Progress', value: `${k.avg_program_progress}%` },
        { icon: Sparkles, label: 'AI calls', value: formatNum(k.ai_calls_month) },
        { icon: Inbox, label: 'Messages', value: String(k.messages_7d) },
        { icon: Wallet, label: 'MRR', value: formatInr(k.mrr_inr) },
      ]
    : [];
  const aiSteps: Array<{ label: string; badge: string; to: string }> = [
    ...(atRisk.length > 0 ? [{ label: `Check in with ${atRisk.length} inactive ${atRisk.length === 1 ? 'client' : 'clients'}`, badge: 'Open', to: '/clients' }] : []),
    ...(pending.length > 0 ? [{ label: `Review ${pending.length} plate ${pending.length === 1 ? 'photo' : 'photos'}`, badge: `${pending.length} new`, to: '/dashboard/plate-review' }] : []),
    ...(recentAssessments.length > 0 ? [{ label: `${recentAssessments.length} ${recentAssessments.length === 1 ? 'assessment' : 'assessments'} to review`, badge: String(recentAssessments.length), to: '/assessments' }] : []),
    { label: 'Draft weekly check-ins', badge: '', to: '/messaging' },
  ];
  // Per-tile accent colours for the stat row (left edge bar · soft card tint · icon chip · hover border)
  const STAT_ACCENT = [
    { bar: 'from-teal-400 to-emerald-500', tint: 'from-teal-500/[0.08]', chip: 'bg-teal-500/15 text-teal-600 dark:text-teal-300', border: 'hover:border-teal-400/50' },
    { bar: 'from-sky-400 to-blue-500', tint: 'from-sky-500/[0.08]', chip: 'bg-sky-500/15 text-sky-600 dark:text-sky-300', border: 'hover:border-sky-400/50' },
    { bar: 'from-emerald-400 to-green-500', tint: 'from-emerald-500/[0.08]', chip: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300', border: 'hover:border-emerald-400/50' },
    { bar: 'from-violet-400 to-fuchsia-500', tint: 'from-violet-500/[0.08]', chip: 'bg-violet-500/15 text-violet-600 dark:text-violet-300', border: 'hover:border-violet-400/50' },
    { bar: 'from-amber-400 to-orange-500', tint: 'from-amber-500/[0.08]', chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-300', border: 'hover:border-amber-400/50' },
    { bar: 'from-rose-400 to-pink-500', tint: 'from-rose-500/[0.08]', chip: 'bg-rose-500/15 text-rose-600 dark:text-rose-300', border: 'hover:border-rose-400/50' },
  ];

  return (
    <OwnerLayout
      practiceName={practiceName}
      ownerName={firstName}
      initials={initials}
      trialDaysLeft={trialDays}
      topbarContext="Overview"
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8 md:py-12">
        <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-8">
          {/* ── Clean greeting header (clinical-clean redesign) ──────── */}
          <motion.div variants={fadeUp}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/50">
                  <GreetingIcon className="h-3.5 w-3.5 text-amber-500 dark:text-amber-300" />
                  {greetingPart()}
                </div>
                <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-[2.4rem]">Hi {ownerName}.</h1>
                <p className="mt-1.5 text-sm text-foreground/60">
                  {formatDate(now, ws?.timezone ?? undefined)} · <span className="tabular-nums">{formatTime(now, ws?.timezone ?? undefined)}</span> · {practiceName}
                  {k ? <> · <span className="font-semibold text-foreground/80">{k.active_7d} of {k.total_clients}</span> active this week</> : null}
                </p>
                {quote && <p className="mt-2 max-w-md border-l-2 border-foreground/10 pl-3 text-sm italic text-foreground/55">“{quote}”</p>}
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/analytics')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-4 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.06]"
                >
                  <TrendingUp className="h-4 w-4" /> Analytics
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/clients')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
                >
                  <Plus className="h-4 w-4" /> Add client
                </button>
              </div>
            </div>
          </motion.div>

          {/* ── Onboarding checklist (until setup is complete) ───────── */}
          {setupReady && !setupDone && (
            <motion.div variants={fadeUp}>
              <OnboardingChecklist steps={setupSteps} onGo={(to) => navigate(to)} />
            </motion.div>
          )}

          {/* ── Stat row - this-week KPIs ─────────────────────────────── */}
          {progressTiles.length > 0 && (
            <motion.div variants={fadeUp} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {progressTiles.map((t, i) => {
                const a = STAT_ACCENT[i % STAT_ACCENT.length];
                return (
                  <div
                    key={t.label}
                    className={cn(
                      'group relative overflow-hidden rounded-2xl border border-foreground/[0.06] bg-card p-4 pl-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                      a.border,
                    )}
                  >
                    {/* soft full-card colour tint */}
                    <span className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent', a.tint)} />
                    {/* solid left edge accent */}
                    <span className={cn('absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b', a.bar)} />
                    <span className={cn('relative grid h-10 w-10 place-items-center rounded-xl', a.chip)}>
                      <t.icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="relative mt-3 text-2xl font-bold tabular-nums tracking-tight">{t.value}</div>
                    <div className="relative text-[11px] font-medium text-foreground/50">{t.label}</div>
                  </div>
                );
              })}
            </motion.div>
          )}

          {/* ── Roster (+ needs attention) · AI rail ──────────────────── */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* LEFT - active roster + needs attention */}
            <div className="min-w-0 space-y-5">
              <div className="mb-4 flex items-center gap-2.5">
                <h2 className="text-xl font-bold tracking-tight">Active roster</h2>
                <span className="text-xl font-bold text-teal-600 dark:text-teal-300">{k?.total_clients ?? 0}</span>
                <button
                  type="button"
                  onClick={() => navigate('/clients')}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-foreground/10 px-3 py-1 text-xs text-foreground/70 transition-colors hover:bg-foreground/[0.04]"
                >
                  See all <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>

              {clientsQ.isLoading ? (
                <Glass className="rounded-2xl p-8 text-center text-sm text-foreground/55">Loading clients…</Glass>
              ) : clients.length === 0 ? (
                <Glass className="rounded-2xl p-8 text-center">
                  <Users className="mx-auto h-8 w-8 text-foreground/20" />
                  <div className="mt-3 text-sm text-foreground/65">No clients yet - invite your first client.</div>
                </Glass>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {clients.slice(0, 6).map((c, i) => {
                    const name = c.display_name || c.name || c.email;
                    const grad = ['from-teal-500/25 to-emerald-400/15', 'from-blue-500/20 to-teal-400/15', 'from-amber-500/20 to-orange-400/12'][i % 3];
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => navigate(`/clients/${clientSlug(name, c.id)}`)}
                        className="group rounded-2xl border border-foreground/[0.06] bg-card p-2 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className={cn('relative h-20 overflow-hidden rounded-xl bg-gradient-to-br', grad)}>
                          <span className="absolute left-2 top-2 grid h-9 w-9 place-items-center rounded-lg bg-background/80 text-xs font-bold text-teal-700 backdrop-blur-sm dark:text-teal-200">
                            {initialsOf(name)}
                          </span>
                        </div>
                        <div className="p-2">
                          <div className="truncate text-sm font-bold">{name}</div>
                          <div className="truncate text-[11px] text-foreground/50">{c.last_active_at ? timeAgo(c.last_active_at) : c.email}</div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="truncate text-[11px] font-medium text-foreground/60">{c.program_type ?? 'No plan'}</span>
                            {c.status && <StatusChip status={c.status} />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <FocalCard
                loading={kpiQ.isLoading}
                totalClients={k?.total_clients ?? 0}
                inactiveCount={inactiveCount}
                onView={() => navigate('/clients')}
              />
            </div>

            {/* RIGHT - next step by AI + roster health + billing */}
            <div className="flex flex-col gap-5">
              <Glass className="rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">Next step by AI</span>
                  <Sparkles className="h-4 w-4 text-teal-500" />
                </div>
                <div className="mt-1.5">
                  {aiSteps.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => navigate(s.to)}
                      className="flex w-full items-center gap-3 border-t border-foreground/[0.06] py-3 text-left transition-opacity first:border-t-0 hover:opacity-70"
                    >
                      <span className={cn('grid h-6 w-6 flex-shrink-0 place-items-center rounded-lg text-xs font-bold', i === 0 ? 'bg-teal-500 text-white' : 'bg-foreground/[0.06] text-foreground/60')}>{i + 1}</span>
                      <span className="flex-1 text-sm font-medium">{s.label}</span>
                      {s.badge && <span className="flex-shrink-0 rounded-full bg-teal-500/12 px-2 py-0.5 text-[11px] font-semibold text-teal-700 dark:text-teal-300">{s.badge}</span>}
                    </button>
                  ))}
                </div>
              </Glass>

              <Glass className="rounded-2xl p-5">
                <div className="text-sm font-bold">Roster health</div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums tracking-tight">{k ? `${k.avg_program_progress}%` : '-'}</span>
                  <span className="text-xs text-foreground/50">avg progress</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-gradient-to-r from-amber-400 via-teal-400 to-emerald-400" />
                <div className="mt-2 flex justify-between text-[11px] font-semibold">
                  <span className="text-foreground/45">At risk</span>
                  <span className="text-teal-700 dark:text-teal-300">Thriving</span>
                </div>
              </Glass>

              <BillingSnapshotCard
                subscription={subscription}
                loading={billingQ.isLoading}
                onOpen={() => navigate('/billing')}
              />
            </div>
          </motion.div>

          {/* ── Assessments to review ────────────────────────────────── */}
          <motion.div variants={fadeUp}>
            <RecentAssessmentsCard
              items={recentAssessments}
              loading={recentAssessQ.isLoading}
              onOpen={(clientId) => navigate(`/clients/${clientId}/assessments`)}
              onManage={() => navigate('/assessments')}
            />
          </motion.div>

          {/* Recent clients + week metrics are folded into the roster + progress section above. */}

          {/* ── Quick actions ───────────────────────────────────────── */}
          <motion.div variants={fadeUp}>
            <div className="mb-3 text-xs uppercase tracking-[0.18em] text-foreground/55">Quick actions</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <QuickAction icon={Plus} label="Invite client" onClick={() => navigate('/clients')} />
              <QuickAction icon={Sparkles} label="New program" onClick={() => navigate('/programs')} />
              <QuickAction icon={Mic} label="Voice note" onClick={() => navigate('/voice')} highlight />
              <QuickAction icon={Camera} label="Scan plate" onClick={() => navigate('/plate-vision')} highlight />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DashboardBanner — per-workspace branded header: logo, name, quote, clock.
// ─────────────────────────────────────────────────────────────────────────

interface DashboardBannerProps {
  firstName: string;
  practiceName: string;
  logoUrl: string | null;
  primary: string;
  accent: string;
  quote: string;
  now: Date;
  timezone?: string;
}

function DashboardBanner({ firstName, practiceName, logoUrl, primary, accent, quote, now, timezone }: DashboardBannerProps) {
  const p = hex6(primary, '#7DBE9D');
  const a = hex6(accent, '#8087FF');
  const time = formatTime(now, timezone);
  const date = formatDate(now, timezone);

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-foreground/[0.06] p-6 md:p-8"
      style={{ background: `linear-gradient(135deg, ${p}22 0%, ${a}16 55%, transparent 100%)` }}
    >
      {/* Brand glow */}
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${a}33, transparent 70%)` }}
      />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {/* Workspace logo */}
          <div
            className="grid h-14 w-14 flex-shrink-0 place-items-center overflow-hidden rounded-2xl ring-1 ring-inset ring-white/30"
            style={{ background: `linear-gradient(135deg, ${p}, ${a})` }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt={practiceName} className="h-full w-full object-cover" />
            ) : (
              <span className="text-base font-semibold text-white">{initialsOf(practiceName)}</span>
            )}
          </div>
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-foreground/[0.08] bg-foreground/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/65">
              <GreetingIcon className="h-3.5 w-3.5 text-amber-500 dark:text-amber-300" />
              {greetingPart()}
            </span>
            <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              Hi {firstName}.
            </h1>
            {quote && (
              <p className="mt-1.5 max-w-xl text-sm italic text-foreground/65">“{quote}”</p>
            )}
          </div>
        </div>

        {/* Live clock */}
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
// FocalCard — "what needs attention", derived from real client activity.
// ─────────────────────────────────────────────────────────────────────────

interface FocalCardProps {
  loading: boolean;
  totalClients: number;
  inactiveCount: number;
  onView: () => void;
}

function FocalCard({ loading, totalClients, inactiveCount, onView }: FocalCardProps) {
  const allClear = inactiveCount === 0;

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
          <Activity className="h-3 w-3" />
          {allClear ? 'All caught up' : 'Needs attention'}
        </span>

        {loading ? (
          <div className="mt-8 flex items-center gap-2 text-sm text-foreground/55">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your workspace…
          </div>
        ) : totalClients === 0 ? (
          <>
            <p className="mt-5 text-lg font-semibold tracking-tight">No clients yet.</p>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/70">
              Invite your first client to start tracking plans, meals, and progress.
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={onView}
                className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
              >
                Invite a client
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </>
        ) : allClear ? (
          <>
            <p className="mt-5 text-lg font-semibold tracking-tight">Everyone's engaged.</p>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/70">
              All {totalClients} {totalClients === 1 ? 'client has' : 'clients have'} been active in the last 7 days. Nothing needs your attention right now.
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={onView}
                className="inline-flex items-center gap-2 rounded-full border border-foreground/10 px-4 py-2.5 text-sm text-foreground/85 hover:bg-foreground/[0.04]"
              >
                View all clients
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-5 text-2xl font-semibold tracking-tight">
              {inactiveCount} {inactiveCount === 1 ? 'client hasn’t' : 'clients haven’t'} been active in 7+ days.
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/70">
              Out of {totalClients} total. A quick check-in keeps them on track - open the client list to see who and reach out.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onView}
                className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
              >
                Review clients
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </>
        )}
      </div>
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MiniTile — compact stat tile for the right column of the focal row.
// ─────────────────────────────────────────────────────────────────────────

type Accent = 'amber' | 'violet' | 'blue';

interface MiniTileProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  progress?: number;
  accent: Accent;
  onClick?: () => void;
}

const MINI_ACCENT: Record<Accent, { icon: string; chip: string; bar: string }> = {
  amber:  { icon: 'text-amber-600 dark:text-amber-300',  chip: 'bg-amber-500/12', bar: 'from-amber-400 to-amber-300' },
  violet: { icon: 'text-teal-600 dark:text-teal-300',    chip: 'bg-teal-500/12',  bar: 'from-teal-500 to-blue-500' },
  blue:   { icon: 'text-blue-600 dark:text-blue-300',    chip: 'bg-blue-500/12',  bar: 'from-blue-500 to-cyan-400' },
};

function MiniTile({ icon: Icon, label, value, hint, progress, accent, onClick }: MiniTileProps) {
  const a = MINI_ACCENT[accent];
  return (
    <button type="button" onClick={onClick} className="group relative h-full text-left">
      <Glass className="h-full rounded-2xl p-5 transition-all group-hover:-translate-y-0.5 group-hover:bg-foreground/[0.04]">
        <span className={cn('grid h-10 w-10 place-items-center rounded-xl', a.chip, a.icon)}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="mt-4 text-3xl font-bold tabular-nums tracking-tight">{value}</div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-foreground/50">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-foreground/50">{hint}</div>}
        {progress !== undefined && (
          <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-foreground/[0.05]">
            <div
              className={cn('h-full bg-gradient-to-r', a.bar)}
              style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
            />
          </div>
        )}
      </Glass>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// CompactKPI — small KPI tile for the ambient strip.
// ─────────────────────────────────────────────────────────────────────────

type KPITone = 'ok' | 'violet' | 'blue';

interface CompactKPIProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  delta?: string;
  sub?: string;
  tone: KPITone;
  /** When set, the tile becomes expandable and reveals this context line. */
  detail?: string;
  /** Deep-link to the full detail view, shown as a CTA when expanded. */
  to?: string;
}

const KPI_TONE: Record<KPITone, { icon: string; chip: string; delta: string }> = {
  ok:     { icon: 'text-emerald-600 dark:text-emerald-300', chip: 'bg-emerald-500/12', delta: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/12' },
  violet: { icon: 'text-teal-600 dark:text-teal-300',       chip: 'bg-teal-500/12',    delta: 'text-teal-700 dark:text-teal-300 bg-teal-500/12' },
  blue:   { icon: 'text-blue-600 dark:text-blue-300',       chip: 'bg-blue-500/12',    delta: 'text-blue-700 dark:text-blue-300 bg-blue-500/12' },
};

function CompactKPI({ icon: Icon, label, value, delta, sub, tone, detail, to }: CompactKPIProps) {
  const t = KPI_TONE[tone];
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const openable = !!(detail || to);

  return (
    <>
      {/* Tapping the tile pops up an info card explaining the metric. */}
      <Glass className={cn('rounded-2xl p-5 transition-all', openable && 'hover:-translate-y-0.5 hover:bg-foreground/[0.03]')}>
        <button
          type="button"
          onClick={() => openable && setOpen(true)}
          className={cn('w-full text-left', openable && 'cursor-pointer')}
          aria-haspopup="dialog"
          disabled={!openable}
        >
          <div className="flex items-center justify-between">
            <span className={cn('grid h-10 w-10 place-items-center rounded-xl', t.chip, t.icon)}>
              <Icon className="h-5 w-5" />
            </span>
            {delta && <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', t.delta)}>↑ {delta}</span>}
          </div>
          <div className="mt-4 text-3xl font-bold tabular-nums tracking-tight">{value}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.16em] text-foreground/50">{label}</span>
            {openable && <Info className="h-3 w-3 text-foreground/30" />}
          </div>
          {sub && <div className="mt-0.5 text-[11px] text-foreground/50">{sub}</div>}
        </button>
      </Glass>

      {open && (
        <Sheet
          onClose={() => setOpen(false)}
          ariaLabel={label}
          // No dim backdrop, so the card needs its own elevation to read as a
          // floating popup: rounded corners, a hairline ring, and a deep shadow.
          className="ring-1 ring-foreground/10 sm:!max-w-md sm:rounded-3xl sm:shadow-[0_32px_80px_-18px_rgba(2,6,23,0.45)]"
          backdropClassName=""
        >
          <div className="p-6 sm:p-7">
            <div className="flex items-start gap-3.5">
              <div className={cn('grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl bg-foreground/[0.05]', t.icon)}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-4xl font-semibold tracking-tight">{value}</span>
                  {delta && <span className={cn('text-sm font-medium', t.delta)}>↑ {delta}</span>}
                </div>
                {sub && <div className="mt-0.5 text-xs text-foreground/55">{sub}</div>}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {detail && <p className="mt-5 text-sm leading-relaxed text-foreground/70">{detail}</p>}

            {to && (
              <button
                type="button"
                onClick={() => { setOpen(false); navigate(to); }}
                className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.01] cta-glow active:scale-[0.97]"
              >
                View details <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Recent clients — real list from clientsApi.
// ─────────────────────────────────────────────────────────────────────────

function RecentClientsCard({
  clients, loading, onSeeAll, onOpen,
}: {
  clients: ClientListItem[];
  loading: boolean;
  onSeeAll: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <Glass className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
        <div>
          <div className="text-sm font-medium">Recent clients</div>
          <div className="text-xs text-foreground/60">Most recently updated</div>
        </div>
        <button
          type="button"
          onClick={onSeeAll}
          className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-xs text-foreground/70 transition-colors hover:bg-foreground/[0.06]"
        >
          See all
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-foreground/50">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading clients…
        </div>
      ) : clients.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <Users className="mx-auto h-8 w-8 text-foreground/20" />
          <div className="mt-3 text-sm text-foreground/65">No clients yet</div>
          <div className="mt-1 text-xs text-foreground/45">Invite a client to see them here.</div>
        </div>
      ) : (
        <ul className="divide-y divide-foreground/[0.04]">
          {clients.map((c) => {
            const name = c.display_name || c.name || c.email;
            return (
              <li key={c.id}>
                {/* Hover-peek: a mini profile fades in without leaving the list. */}
                <HoverCard openDelay={180} closeDelay={120}>
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onOpen(clientSlug(name, c.id))}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-foreground/[0.03]"
                    >
                      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.30)] to-[hsl(var(--brand-magenta)_/_0.20)] text-xs font-medium">
                        {initialsOf(name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{name}</span>
                          {c.status && <StatusChip status={c.status} />}
                        </div>
                        <div className="truncate text-[11px] text-foreground/55">
                          {c.program_type ? c.program_type : c.email}
                        </div>
                      </div>
                      <div className="text-right text-[11px] text-foreground/55">{timeAgo(c.updated_at)}</div>
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent align="start" side="right" className="w-64">
                    <ClientPeek client={c} name={name} />
                  </HoverCardContent>
                </HoverCard>
              </li>
            );
          })}
        </ul>
      )}
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Recent assessments — completed forms across the workspace, ready to review.
// ─────────────────────────────────────────────────────────────────────────

const BAND_TONE: Array<{ test: (n: number) => boolean; cls: string }> = [
  { test: (n) => n >= 80, cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200' },
  { test: (n) => n >= 60, cls: 'bg-teal-500/15 text-teal-700 dark:text-teal-200' },
  { test: (n) => n >= 40, cls: 'bg-amber-400/15 text-amber-700 dark:text-amber-200' },
  { test: () => true,     cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-200' },
];

function RecentAssessmentsCard({
  items, loading, onOpen, onManage,
}: {
  items: RecentAssessment[];
  loading: boolean;
  onOpen: (clientId: string) => void;
  onManage: () => void;
}) {
  return (
    <Glass className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-teal-600 dark:text-teal-300" />
          <div>
            <div className="text-sm font-medium">Assessments to review</div>
            <div className="text-xs text-foreground/60">Recently completed by your clients</div>
          </div>
          {items.length > 0 && (
            <span className="ml-1 rounded-full bg-teal-500/15 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:text-teal-200">{items.length}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onManage}
          className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-xs text-foreground/70 transition-colors hover:bg-foreground/[0.06]"
        >
          Manage forms
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-foreground/50">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading assessments…
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <ClipboardCheck className="mx-auto h-8 w-8 text-foreground/20" />
          <div className="mt-3 text-sm text-foreground/65">No completed assessments yet</div>
          <div className="mt-1 text-xs text-foreground/45">When a client submits a form, it appears here to review.</div>
        </div>
      ) : (
        <ul className="divide-y divide-foreground/[0.04]">
          {items.map((a) => {
            const tone = a.score != null ? BAND_TONE.find((b) => b.test(a.score!))!.cls : '';
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onOpen(clientSlug(a.client_name, a.client_id))}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-foreground/[0.03]"
                >
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-teal-500/25 to-emerald-500/15 text-xs font-medium">
                    {initialsOf(a.client_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.client_name}</div>
                    <div className="truncate text-[11px] text-foreground/55">{a.title ?? 'Assessment'} · {timeAgo(a.submitted_at)}</div>
                  </div>
                  {a.score != null && (
                    <span className={cn('flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', tone)}>
                      {a.score}{a.band ? ` · ${a.band}` : ''}
                    </span>
                  )}
                  <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-foreground/30" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ClientPeek — mini profile shown on hover, built from the list item (no fetch).
// ─────────────────────────────────────────────────────────────────────────

function ClientPeek({ client, name }: { client: ClientListItem; name: string }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Status', value: client.status ?? '-' },
    { label: 'Program', value: client.program_type ?? '-' },
    { label: 'Last active', value: client.last_active_at ? timeAgo(client.last_active_at) : '-' },
  ];
  if (client.target_kcal != null) rows.push({ label: 'Target', value: `${client.target_kcal} kcal` });

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.30)] to-[hsl(var(--brand-magenta)_/_0.20)] text-xs font-medium">
          {initialsOf(name)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="truncate text-xs text-foreground/55">{client.email}</div>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 text-xs">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3">
            <span className="text-foreground/50">{r.label}</span>
            <span className="truncate font-medium capitalize">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// This week — real analytics summary (replaces the old mocked schedule).
// ─────────────────────────────────────────────────────────────────────────

function WeekSummaryCard({
  k, loading,
}: {
  k: import('@/modules/workspace/api/analytics').OverviewKpis | undefined;
  loading: boolean;
}) {
  const rows: Array<{ icon: ComponentType<{ className?: string }>; label: string; value: string }> = k
    ? [
        { icon: Users, label: 'New clients this month', value: String(k.new_clients_month) },
        { icon: Activity, label: 'Active programs', value: String(k.active_programs) },
        { icon: CheckCircle2, label: 'Average program progress', value: `${k.avg_program_progress}%` },
        { icon: Sparkles, label: 'AI calls this month', value: formatNum(k.ai_calls_month) },
        { icon: Inbox, label: 'Messages (7 days)', value: String(k.messages_7d) },
      ]
    : [];

  return (
    <Glass className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
        <div>
          <div className="text-sm font-medium">This week</div>
          <div className="text-xs text-foreground/60">Live workspace metrics</div>
        </div>
        <Calendar className="h-4 w-4 text-foreground/55" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-foreground/50">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading metrics…
        </div>
      ) : (
        <ul className="divide-y divide-foreground/[0.04]">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-3 px-5 py-3">
              <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-foreground/[0.04] text-foreground/60">
                <r.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 text-sm text-foreground/85">{r.label}</div>
              <div className="text-sm font-semibold tabular-nums">{r.value}</div>
            </li>
          ))}
        </ul>
      )}
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Onboarding checklist — derived from real setup state.
// ─────────────────────────────────────────────────────────────────────────

interface SetupStep { label: string; done: boolean; to: string }

function OnboardingChecklist({ steps, onGo }: { steps: SetupStep[]; onGo: (to: string) => void }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <Glass className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
        <div>
          <div className="text-sm font-medium">Finish setting up</div>
          <div className="text-xs text-foreground/60">{done} of {steps.length} done - a few steps to get the most out of NUSI.</div>
        </div>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-foreground/[0.06]">
          <div className="h-full bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>
      <ul className="divide-y divide-foreground/[0.04]">
        {steps.map((s) => (
          <li key={s.label}>
            <button
              type="button"
              onClick={() => !s.done && onGo(s.to)}
              className={cn('flex w-full items-center gap-3 px-5 py-3 text-left', s.done ? 'cursor-default' : 'transition-colors hover:bg-foreground/[0.03]')}
            >
              {s.done
                ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                : <Circle className="h-4 w-4 flex-shrink-0 text-foreground/25" />}
              <span className={cn('flex-1 text-sm', s.done ? 'text-foreground/45 line-through' : 'text-foreground/90')}>{s.label}</span>
              {!s.done && <ArrowRight className="h-3.5 w-3.5 text-foreground/30" />}
            </button>
          </li>
        ))}
      </ul>
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Pending approvals — plate review queue.
// ─────────────────────────────────────────────────────────────────────────

function PendingApprovalsCard({ items, loading, onOpen }: { items: ReviewQueueItem[]; loading: boolean; onOpen: () => void }) {
  return (
    <Glass className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-teal-600 dark:text-teal-300" />
          <span className="text-sm font-medium">Pending approvals</span>
        </div>
        {items.length > 0 && (
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-200">{items.length}</span>
        )}
      </div>
      {loading ? (
        <CardSpinner />
      ) : items.length === 0 ? (
        <CardEmpty icon={CheckCircle2} text="Nothing to review" sub="Plate photos you need to approve will appear here." />
      ) : (
        <>
          <ul className="flex-1 divide-y divide-foreground/[0.04]">
            {items.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{p.client_name ?? 'Client'}</div>
                  <div className="truncate text-[11px] text-foreground/55">{p.meal_type ?? 'meal'}{p.logged_at ? ` · ${timeAgo(p.logged_at)}` : ''}</div>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" onClick={onOpen} className="border-t border-foreground/[0.06] px-5 py-2.5 text-left text-xs font-medium text-teal-700 hover:bg-foreground/[0.03] dark:text-teal-300">
            Review queue →
          </button>
        </>
      )}
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// At-risk clients — least-recently-active, by name.
// ─────────────────────────────────────────────────────────────────────────

function AtRiskCard({
  clients, loading, onOpen, onSeeAll,
}: {
  clients: ClientListItem[];
  loading: boolean;
  onOpen: (id: string) => void;
  onSeeAll: () => void;
}) {
  return (
    <Glass className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
          <span className="text-sm font-medium">Needs a check-in</span>
        </div>
        {clients.length > 0 && (
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-200">{clients.length}</span>
        )}
      </div>
      {loading ? (
        <CardSpinner />
      ) : clients.length === 0 ? (
        <CardEmpty icon={CheckCircle2} text="Everyone's recently active" sub="Clients quiet for 7+ days show up here." />
      ) : (
        <>
          <ul className="flex-1 divide-y divide-foreground/[0.04]">
            {clients.map((c) => {
              const name = c.display_name || c.name || c.email;
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => onOpen(clientSlug(name, c.id))} className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-foreground/[0.03]">
                    <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-500/25 to-rose-500/15 text-[10px] font-medium">
                      {initialsOf(name)}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                    <span className="text-[11px] text-foreground/55">{timeAgo(c.updated_at)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={onSeeAll} className="border-t border-foreground/[0.06] px-5 py-2.5 text-left text-xs font-medium text-teal-700 hover:bg-foreground/[0.03] dark:text-teal-300">
            All clients →
          </button>
        </>
      )}
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Billing snapshot — current subscription / trial.
// ─────────────────────────────────────────────────────────────────────────

function BillingSnapshotCard({ subscription, loading, onOpen }: { subscription: CurrentSubscription | null; loading: boolean; onOpen: () => void }) {
  return (
    <Glass className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-300" />
          <span className="text-sm font-medium">Billing</span>
        </div>
      </div>
      {loading ? (
        <CardSpinner />
      ) : (
        <div className="flex flex-1 flex-col gap-3 p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-foreground/55">Plan</span>
            <span className="text-sm font-semibold capitalize">{subscription?.plan_key ?? 'Trial'}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-foreground/55">Status</span>
            <span className="text-sm capitalize">{subscription?.status ?? 'trialing'}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-foreground/55">{subscription?.status === 'active' ? 'Renews' : 'Trial ends'}</span>
            <span className="text-sm">
              {subscription?.current_period_end
                ? shortDate(subscription.current_period_end)
                : subscription?.trial_ends_at
                  ? shortDate(subscription.trial_ends_at)
                  : '-'}
            </span>
          </div>
          {subscription?.amount_paise != null && (
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-foreground/55">Amount</span>
              <span className="text-sm font-semibold">{formatInr(subscription.amount_paise / 100)}</span>
            </div>
          )}
          <button type="button" onClick={onOpen} className="mt-auto inline-flex items-center gap-1 self-start text-xs font-medium text-teal-700 hover:underline dark:text-teal-300">
            Manage subscription →
          </button>
        </div>
      )}
    </Glass>
  );
}

function CardSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 py-10 text-sm text-foreground/50">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}

function CardEmpty({ icon: Icon, text, sub }: { icon: ComponentType<{ className?: string }>; text: string; sub: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-8 text-center">
      <Icon className="h-7 w-7 text-foreground/20" />
      <div className="mt-2 text-sm text-foreground/65">{text}</div>
      <div className="mt-1 text-[11px] text-foreground/45">{sub}</div>
    </div>
  );
}

function QuickAction({
  icon: Icon, label, onClick, highlight,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex items-center gap-3 rounded-2xl border bg-card px-4 py-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
        highlight ? 'border-teal-400/40' : 'border-foreground/[0.06]',
      )}
    >
      <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-teal-500/12 text-teal-700 dark:text-teal-300">
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-sm font-semibold">{label}</span>
      {highlight && (
        <span className="ml-auto rounded-full bg-teal-400/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-200">
          AI
        </span>
      )}
    </button>
  );
}

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:    'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200',
    completed: 'border-blue-400/40 bg-blue-400/10 text-blue-700 dark:text-blue-200',
    paused:    'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200',
    archived:  'border-foreground/15 bg-foreground/[0.04] text-foreground/50',
  };
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] capitalize',
        styles[status] ?? 'border-foreground/10 bg-foreground/[0.04] text-foreground/50',
      )}
    >
      {status}
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '-';
}

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

function longDate(): string {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Normalise a colour to #RRGGBB (drops alpha / bad values) so alpha can be appended. */
function hex6(c: string | undefined, fallback: string): string {
  if (!c || !/^#[0-9a-fA-F]{6}/.test(c)) return fallback;
  return c.slice(0, 7);
}

function formatTime(d: Date, tz?: string): string {
  try {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz || undefined });
  } catch {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
}

function formatDate(d: Date, tz?: string): string {
  try {
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz || undefined });
  } catch {
    return longDate();
  }
}


/** Daily rotating quote from the shared 100-quote wellness library — same quote
 *  the client sees that day — used when the owner hasn't set their own. */
function dailyQuote(): string {
  return quoteOfTheDay();
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function daysUntil(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86_400_000));
}

function formatNum(n: number): string {
  return n.toLocaleString();
}

/** ₹ compact: 64300 → ₹64.3K, 1250000 → ₹12.5L. */
function formatInr(n: number): string {
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

function titleCaseWord(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function timeAgo(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
