import { type ComponentType } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, Calendar, ChevronRight, ClipboardCheck,
  CreditCard, Sparkles, Users,
} from 'lucide-react';

import { fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { useOwnerIdentity } from '@/hooks/useOwnerIdentity';
import { analyticsApi } from '@/modules/workspace/api/analytics';
import { clientsApi, clientSlug } from '@/modules/workspace/api/clients';
import { workspacesApi } from '@/modules/workspace/api/workspaces';
import { billingApi } from '@/modules/workspace/billing/api';
import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/utils';

/**
 * Owner Overview — clinical-clean redesign.
 *
 * A calm, decluttered dashboard: one honest stat row (no metric shown twice),
 * an actionable "Needs attention" panel as the focus, and a quiet right rail
 * for upcoming sessions + a single AI insight. Same real data as before
 * (analyticsApi / clientsApi / billingApi) — the earlier version repeated the
 * avg-compliance number three times (KPI + momentum donut + pulse ring) and
 * padded the page with a decorative date strip and sidebar shortcuts. All gone.
 */
export default function OverviewWellness() {
  const { t } = useTranslation('ownerOverview');
  const { firstName } = useOwnerIdentity();
  const navigate = useNavigate();

  const wsQ = useQuery({ queryKey: ['workspace', 'me'], queryFn: workspacesApi.me });
  const kpiQ = useQuery({ queryKey: ['analytics', 'overview'], queryFn: analyticsApi.overview });
  const insightQ = useQuery({ queryKey: ['analytics', 'insights'], queryFn: analyticsApi.insights, staleTime: 5 * 60 * 1000 });
  const atRiskQ = useQuery({ queryKey: ['analytics', 'at-risk'], queryFn: () => analyticsApi.atRisk() });
  const { data: scope } = useScope();
  const isOwner = scope?.workspaceRole === 'owner' || !!scope?.isSuperAdmin;
  const billingQ = useQuery({ queryKey: ['billing', 'subscription'], queryFn: billingApi.currentSubscription, enabled: isOwner });
  const apptsQ = useQuery({ queryKey: ['workspaces', 'me', 'appointments'], queryFn: () => clientsApi.listWorkspaceAppointments() });

  const ws = wsQ.data;
  const k = kpiQ.data;
  const atRisk = atRiskQ.data ?? [];
  const subscription = billingQ.data?.subscription ?? null;
  const practiceName = ws?.display_name || ws?.name || t('fallback.practice');

  const nowMs = Date.now();
  const upcoming = (apptsQ.data ?? [])
    .filter((a) => new Date(a.scheduled_at).getTime() > nowMs && a.status === 'scheduled')
    .sort((x, y) => new Date(x.scheduled_at).getTime() - new Date(y.scheduled_at).getTime())
    .slice(0, 5);

  const total = k?.total_clients ?? 0;
  const active = k?.active_7d ?? 0;
  const riskN = atRisk.length;
  const avgProgress = k?.avg_program_progress ?? 0;
  // NOTE: this is the workspace's OWN NUSI subscription cost (what the
  // practice pays us), not revenue it earns — hence the "Your plan" label.
  const planCost = subscription?.amount_paise != null ? Math.round(subscription.amount_paise / 100) : (k?.mrr_inr ?? 0);
  const planName = subscription ? prettyPlan(subscription.plan_key) : null;
  const insight = insightQ.data?.insights?.trim();

  return (
    <OwnerLayout practiceName={practiceName} ownerName={firstName} initials={initialsOf(practiceName)} topbarContext="Overview">
      <div className="mx-auto w-full max-w-6xl px-4 py-7 md:px-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-6">

          {/* ── Header ─────────────────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">
                {todayLabel()}
              </div>
              <h1 className="mt-1 text-[26px] font-bold tracking-tight md:text-[30px]">
                {t(`greeting.${timeOfDay()}`)},{' '}
                <span className="bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] bg-clip-text text-transparent">
                  {firstName}
                </span>
              </h1>
              <p className="mt-1 text-sm text-foreground/55">
                {practiceName} · {t('subtitle.clientCount', { count: total })} · {t('subtitle.activeThisWeek', { count: active })}
              </p>
            </div>
            <button
              onClick={() => navigate('/clients')}
              className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-card px-4 py-2 text-[13px] font-semibold text-foreground/80 transition hover:border-foreground/20 hover:bg-foreground/[0.03]"
            >
              <Users className="h-3.5 w-3.5" /> {t('actions.allClients')}
            </button>
          </motion.div>

          {/* ── Stat row (each metric appears exactly once) ────────────── */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              tint="teal" icon={Users} label={t('stats.activeClients')}
              value={fmtNum(k?.active_clients ?? 0)}
              sub={t('stats.ofTotal', { count: fmtNum(total) })}
              onClick={() => navigate('/clients')}
            />
            <Stat
              tint="sky" icon={ClipboardCheck} label={t('stats.activePrograms')}
              value={fmtNum(k?.active_programs ?? 0)}
              sub={t('stats.avgProgress', { pct: avgProgress })}
              onClick={() => navigate('/programs')}
            />
            <Stat
              tint={riskN > 0 ? 'rose' : 'emerald'} icon={AlertTriangle} label={t('stats.needsNudge')}
              value={fmtNum(riskN)}
              sub={riskN > 0 ? t('stats.clientsAtRisk') : t('stats.allOnTrack')}
              onClick={() => navigate('/clients?filter=at_risk')}
            />
            <Stat
              tint="violet" icon={CreditCard} label={t('stats.yourPlan')}
              value={planCost > 0 ? `₹${fmtNum(planCost)}` : '—'}
              sub={!isOwner ? t('stats.ownerOnly') : planName ? t('stats.planPerMonth', { plan: planName }) : t('stats.noActivePlan')}
              onClick={() => isOwner && navigate('/billing')}
            />
          </motion.div>

          {/* ── Body ───────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">

            {/* Focus: needs attention */}
            <motion.div variants={fadeUp}>
              <Panel
                eyebrow={t('attention.eyebrow')}
                title={t('attention.title')}
                icon={AlertTriangle}
                tint="rose"
                action={riskN > 0 ? { label: t('actions.reviewAll'), onClick: () => navigate('/clients?filter=at_risk') } : undefined}
              >
                {atRisk.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="text-sm font-semibold">{t('attention.emptyTitle')}</div>
                    <p className="max-w-xs text-xs text-foreground/50">{t('attention.emptyBody')}</p>
                  </div>
                ) : (
                  <div className="flex flex-col divide-y divide-foreground/[0.05]">
                    {atRisk.slice(0, 6).map((c: any, i) => {
                      const nm = c.display_name || c.name || t('fallback.client');
                      return (
                        <button
                          key={c.id}
                          onClick={() => navigate(`/clients/${clientSlug({ id: c.id, name: nm } as any)}`)}
                          className="group flex items-center gap-3 py-3 text-left transition first:pt-1 last:pb-1"
                        >
                          <div className="grid h-10 w-10 flex-none place-items-center rounded-xl text-[13px] font-bold text-white" style={{ background: AVATAR[i % AVATAR.length] }}>
                            {initialsOf(nm)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[14px] font-semibold">{nm}</div>
                            <div className="truncate text-[12px] text-foreground/50">{c.program_type || t('attention.programFallback')} · {lastSeen(c.last_active_at, t)}</div>
                          </div>
                          <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-[10.5px] font-semibold text-rose-600 dark:text-rose-400">{t('attention.atRisk')}</span>
                          <ChevronRight className="h-4 w-4 flex-none text-foreground/25 transition group-hover:text-foreground/45" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </motion.div>

            {/* Right rail */}
            <div className="flex flex-col gap-5">
              {/* Upcoming sessions */}
              <motion.div variants={fadeUp}>
                <Panel
                  eyebrow={t('schedule.eyebrow')}
                  title={t('schedule.title')}
                  icon={Calendar}
                  tint="sky"
                  action={{ label: t('actions.calendar'), onClick: () => navigate('/appointments') }}
                >
                  {upcoming.length === 0 ? (
                    <div className="flex flex-col items-center gap-1.5 py-8 text-center">
                      <Calendar className="h-5 w-5 text-foreground/25" />
                      <div className="text-xs text-foreground/45">{t('schedule.empty')}</div>
                    </div>
                  ) : (
                    <div className="flex flex-col divide-y divide-foreground/[0.05]">
                      {upcoming.map((a, i) => (
                        <button
                          key={a.id}
                          onClick={() => navigate(`/appointments/${a.id}`)}
                          className="group flex items-center gap-3 py-3 text-left first:pt-1 last:pb-1"
                        >
                          <div className="grid h-9 w-9 flex-none place-items-center rounded-lg text-[12px] font-bold text-white" style={{ background: AVATAR[i % AVATAR.length] }}>
                            {initialsOf(a.client_name || t('fallback.client'))}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-semibold">{a.client_name || t('fallback.client')}</div>
                            <div className="truncate text-[11px] text-foreground/50">{apptWhen(a.scheduled_at, t)}</div>
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 flex-none text-foreground/25 transition group-hover:text-foreground/45" />
                        </button>
                      ))}
                    </div>
                  )}
                </Panel>
              </motion.div>

              {/* AI insight — only when there's a real one */}
              {insight && (
                <motion.div variants={fadeUp}>
                  <button
                    onClick={() => navigate('/analytics')}
                    className="group w-full rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-50/80 to-sky-50/60 p-5 text-left transition hover:shadow-md dark:border-violet-400/15 dark:from-violet-500/[0.1] dark:to-sky-500/[0.06]"
                  >
                    <div className="flex items-center gap-2 text-[hsl(var(--brand-magenta))]">
                      <Sparkles className="h-4 w-4" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em]">{t('insight.label')}</span>
                    </div>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-foreground/80">{firstLine(insight)}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[hsl(var(--brand-blue))]">
                      {t('actions.openAnalytics')} <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
                    </span>
                  </button>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────── */
const AVATAR = ['#E4749B', '#5AA9D6', '#D9A15C', '#3FAE88', '#9B7BD6'];

type Tint = 'teal' | 'sky' | 'violet' | 'rose' | 'emerald' | 'amber';

/** Soft, theme-aware colour sets — one per stat/panel so the page reads at a glance. */
const TINT: Record<Tint, { card: string; chip: string; value: string }> = {
  teal:    { card: 'border-teal-500/20 bg-teal-50/70 dark:border-teal-400/15 dark:bg-teal-500/[0.08]',       chip: 'bg-teal-500/15 text-teal-600 dark:text-teal-300',       value: 'text-teal-700 dark:text-teal-100' },
  sky:     { card: 'border-sky-500/20 bg-sky-50/70 dark:border-sky-400/15 dark:bg-sky-500/[0.08]',           chip: 'bg-sky-500/15 text-sky-600 dark:text-sky-300',          value: 'text-sky-700 dark:text-sky-100' },
  violet:  { card: 'border-violet-500/20 bg-violet-50/70 dark:border-violet-400/15 dark:bg-violet-500/[0.08]', chip: 'bg-violet-500/15 text-violet-600 dark:text-violet-300', value: 'text-violet-700 dark:text-violet-100' },
  rose:    { card: 'border-rose-500/20 bg-rose-50/70 dark:border-rose-400/15 dark:bg-rose-500/[0.08]',        chip: 'bg-rose-500/15 text-rose-600 dark:text-rose-300',       value: 'text-rose-700 dark:text-rose-100' },
  emerald: { card: 'border-emerald-500/20 bg-emerald-50/70 dark:border-emerald-400/15 dark:bg-emerald-500/[0.08]', chip: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300', value: 'text-emerald-700 dark:text-emerald-100' },
  amber:   { card: 'border-amber-500/20 bg-amber-50/70 dark:border-amber-400/15 dark:bg-amber-500/[0.08]',    chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',    value: 'text-amber-700 dark:text-amber-100' },
};

function Stat({ tint, icon: Icon, label, value, sub, onClick }: {
  tint: Tint;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string; value: string; sub: string; onClick?: () => void;
}) {
  const t = TINT[tint];
  return (
    <button
      onClick={onClick}
      className={cn('group flex flex-col rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md', t.card)}
    >
      <div className="flex items-center gap-2">
        <span className={cn('grid h-8 w-8 flex-none place-items-center rounded-xl', t.chip)}>
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-foreground/55">{label}</span>
      </div>
      <div className={cn('mt-3 text-[27px] font-bold leading-none tracking-tight tabular-nums', t.value)}>{value}</div>
      <div className="mt-1.5 text-[11.5px] text-foreground/55">{sub}</div>
    </button>
  );
}

function Panel({ eyebrow, title, icon: Icon, tint, action, children }: {
  eyebrow: string; title: string;
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  tint?: Tint;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  const t = tint ? TINT[tint] : null;
  return (
    <div className="rounded-3xl border border-foreground/[0.07] bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {Icon && t && (
            <span className={cn('grid h-9 w-9 flex-none place-items-center rounded-xl', t.chip)}>
              <Icon className="h-4 w-4" strokeWidth={2} />
            </span>
          )}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40">{eyebrow}</div>
            <h3 className="mt-0.5 text-[15px] font-bold tracking-tight">{title}</h3>
          </div>
        </div>
        {action && (
          <button onClick={action.onClick} className="text-[12px] font-semibold text-[hsl(var(--brand-blue))] hover:underline">
            {action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────── */
function initialsOf(name: string): string {
  return (name || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
}
function timeOfDay(): string { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; }
function todayLabel(): string {
  return new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}
function fmtNum(n: number): string { return (n ?? 0).toLocaleString('en-IN'); }
/** 'scale_pro' → 'Scale Pro'. Drops a trailing '_annual' cycle marker. */
function prettyPlan(key: string): string {
  return (key || '')
    .replace(/_annual$/, '')
    .split('_')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ') || 'Plan';
}
function firstLine(s: string): string { const t = s.trim().replace(/^[•\-\s]+/, ''); return t.split('\n')[0].slice(0, 140); }
function lastSeen(iso: string | null | undefined, t: TFunction): string {
  if (!iso) return t('lastSeen.none');
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? t('lastSeen.today') : d === 1 ? t('lastSeen.oneDay') : t('lastSeen.days', { count: d });
}
function apptWhen(iso: string, t: TFunction): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return t('apptWhen.today', { time });
  if (d.toDateString() === tomorrow.toDateString()) return t('apptWhen.tomorrow', { time });
  const date = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  return t('apptWhen.date', { date, time });
}
