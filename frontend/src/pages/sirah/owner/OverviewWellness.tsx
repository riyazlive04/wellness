import { useEffect, useState, type ComponentType } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, Bell, Calendar, ChefHat, ClipboardCheck, CreditCard, Camera,
  Sparkles, TrendingUp, Users, Wallet, Zap, Plus,
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
 * Owner Overview — "wellness" restyle (ocean-teal brand).
 *
 * Same real data as the classic Overview (analyticsApi.overview / atRisk /
 * insights, clientsApi.list, billingApi), re-presented in the rounded, warm
 * card style with a gradient hero, pastel KPI cards, a compliance donut and a
 * practice-pulse ring. No mock numbers — empty states stay honest.
 */
export default function OverviewWellness() {
  const { firstName } = useOwnerIdentity();
  const navigate = useNavigate();

  const wsQ = useQuery({ queryKey: ['workspace', 'me'], queryFn: workspacesApi.me });
  const kpiQ = useQuery({ queryKey: ['analytics', 'overview'], queryFn: analyticsApi.overview });
  const clientsQ = useQuery({ queryKey: ['clients', 'recent'], queryFn: () => clientsApi.list({ limit: 5 }) });
  const insightQ = useQuery({ queryKey: ['analytics', 'insights'], queryFn: analyticsApi.insights, staleTime: 5 * 60 * 1000 });
  const atRiskQ = useQuery({ queryKey: ['analytics', 'at-risk'], queryFn: () => analyticsApi.atRisk() });
  const { data: scope } = useScope();
  const isOwner = scope?.workspaceRole === 'owner' || !!scope?.isSuperAdmin;
  const billingQ = useQuery({ queryKey: ['billing', 'subscription'], queryFn: billingApi.currentSubscription, enabled: isOwner });

  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60_000); return () => clearInterval(t); }, []);

  const ws = wsQ.data;
  const k = kpiQ.data;
  const clients = clientsQ.data?.items ?? [];
  const atRisk = atRiskQ.data ?? [];
  const subscription = billingQ.data?.subscription ?? null;
  const practiceName = ws?.display_name || ws?.name || 'Your practice';

  // Compliance tiers — real per-client grading from the API (mutually
  // exclusive: on track ≤3d, needs nudge 3–10d, at risk >10d since last meal).
  const total = k?.total_clients ?? 0;
  const active = k?.active_7d ?? 0;
  const onTrack = k?.on_track ?? 0;
  const needsNudge = k?.needs_nudge ?? 0;
  const atRiskTier = k?.at_risk ?? atRisk.length;
  const graded = onTrack + needsNudge + atRiskTier; // = active clients
  const riskN = atRisk.length; // drives the separate "needs a nudge" hero card
  const avgProgress = k?.avg_program_progress ?? 0;
  const mrr = subscription?.amount_paise != null ? Math.round(subscription.amount_paise / 100) : (k?.mrr_inr ?? 0);
  // Practice-pulse score: weighted active-share + avg progress.
  const pulse = total > 0 ? Math.round(((active / total) * 0.5 + (avgProgress / 100) * 0.5) * 100) : 0;

  const donut = graded > 0
    ? `conic-gradient(#34b98a 0 ${(onTrack / graded) * 100}%, #e0a63c ${(onTrack / graded) * 100}% ${((onTrack + needsNudge) / graded) * 100}%, #e27564 ${((onTrack + needsNudge) / graded) * 100}% 100%)`
    : 'conic-gradient(var(--muted-ring,#d8ded9) 0 100%)';

  return (
    <OwnerLayout practiceName={practiceName} ownerName={firstName} initials={initialsOf(practiceName)} topbarContext="Overview">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-9">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate">

          {/* greeting */}
          <motion.div variants={fadeUp} className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[26px] font-extrabold tracking-tight md:text-3xl">Good {timeOfDay()}, {firstName} <span className="align-middle">☀️</span></h1>
              <p className="mt-1 text-sm text-foreground/55">{practiceName} · {total} clients · {active} active this week</p>
            </div>
            <div className="flex gap-1.5">
              {weekDates().map((d) => (
                <div key={d.n} className={cn('grid h-[52px] w-10 place-content-center rounded-2xl border text-center text-[11px] leading-tight',
                  d.today ? 'border-transparent bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white' : 'border-foreground/[0.06] bg-foreground/[0.03] text-foreground/55')}>
                  <b className={cn('block text-[15px] font-extrabold', d.today ? 'text-white' : 'text-foreground')}>{d.n}</b>{d.lbl}
                </div>
              ))}
            </div>
          </motion.div>

          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.15fr_1fr_.82fr]">

            {/* COLUMN A */}
            <div className="flex flex-col gap-3.5">
              {/* hero */}
              <motion.div variants={fadeUp}
                className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] p-5 text-white shadow-lg">
                <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/15 blur-md" />
                <span className="inline-block rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold"><Zap className="mr-1 inline h-3 w-3" />Needs attention</span>
                <h2 className="mt-3 max-w-[85%] text-[22px] font-extrabold leading-tight tracking-tight">
                  {riskN > 0 ? `${riskN} client${riskN === 1 ? '' : 's'} need${riskN === 1 ? 's' : ''} a nudge` : 'Everyone is on track 🎉'}
                </h2>
                <p className="mt-1.5 max-w-[80%] text-[12.5px] text-white/85">
                  {riskN > 0 ? 'Low activity or missed check-ins. A quick message keeps compliance up.' : 'No at-risk clients right now — great coaching.'}
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex">
                    {atRisk.slice(0, 3).map((c: any, i) => (
                      <div key={c.id} className="grid h-9 w-9 place-items-center rounded-full border-[2.5px] border-white text-[11px] font-extrabold text-white"
                        style={{ marginLeft: i ? -9 : 0, background: AVATAR[i % AVATAR.length] }}>{initialsOf(c.display_name || c.name || '?')}</div>
                    ))}
                  </div>
                  <button onClick={() => navigate(riskN > 0 ? '/clients?filter=at_risk' : '/clients')}
                    className="ml-auto rounded-full bg-white px-4 py-2.5 text-[13px] font-extrabold text-[hsl(var(--brand-blue))] transition hover:opacity-90">
                    {riskN > 0 ? 'Review clients →' : 'View clients →'}
                  </button>
                </div>
              </motion.div>

              {/* KPI cards */}
              <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3">
                <Kpi tint="teal" icon={Users} label="Active clients" value={fmtNum(k?.active_clients ?? 0)} sub={`+${k?.new_clients_month ?? 0} this month`} onClick={() => navigate('/clients')} />
                <Kpi tint="sky" icon={ClipboardCheck} label="Active programs" value={fmtNum(k?.active_programs ?? 0)} sub={`${avgProgress}% avg progress`} onClick={() => navigate('/programs')} />
                <Kpi tint="violet" icon={TrendingUp} label="Avg compliance" value={`${avgProgress}%`} sub={`${active} active / week`} onClick={() => navigate('/analytics')} />
                <Kpi tint="amber" icon={Wallet} label="Monthly revenue" value={mrr > 0 ? `₹${fmtNum(mrr)}` : '—'} sub={isOwner ? 'active plans' : 'owner only'} onClick={() => isOwner && navigate('/billing')} />
              </motion.div>

              {/* at-risk list */}
              <motion.div variants={fadeUp} className="rounded-3xl border border-foreground/[0.06] bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div><div className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40">Priority</div><h3 className="mt-0.5 text-sm font-extrabold">At-risk clients</h3></div>
                  <button onClick={() => navigate('/clients')} className="text-xs font-bold text-[hsl(var(--brand-blue))]">View all →</button>
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  {atRisk.length === 0 && <Empty text="No at-risk clients — nice work." />}
                  {atRisk.slice(0, 4).map((c: any, i) => {
                    const nm = c.display_name || c.name || 'Client';
                    return (
                      <button key={c.id} onClick={() => navigate(`/clients/${clientSlug({ id: c.id, name: nm } as any)}`)}
                        className="flex items-center gap-3 rounded-2xl border border-foreground/[0.05] bg-foreground/[0.02] p-2.5 text-left transition hover:bg-foreground/[0.04]">
                        <div className="grid h-9 w-9 place-items-center rounded-xl text-[13px] font-extrabold text-white" style={{ background: AVATAR[i % AVATAR.length] }}>{initialsOf(nm)}</div>
                        <div className="min-w-0"><div className="truncate text-[13.5px] font-bold">{nm}</div><div className="truncate text-[11px] text-foreground/55">{c.program_type || 'Program'} · {lastSeen(c.last_active_at)}</div></div>
                        <span className="ml-auto rounded-full bg-rose-400/15 px-2.5 py-1 text-[10.5px] font-bold text-rose-600 dark:text-rose-300">At risk</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </div>

            {/* COLUMN B */}
            <div className="flex flex-col gap-3.5">
              {/* compliance donut */}
              <motion.div variants={fadeUp} className="rounded-3xl border border-foreground/[0.06] bg-card p-4 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40">This week</div>
                <h3 className="mb-1 mt-0.5 text-sm font-extrabold">Client compliance</h3>
                <div className="flex items-center gap-4">
                  <div className="relative h-[128px] w-[128px] flex-none rounded-full" style={{ background: donut }}>
                    <div className="absolute inset-[15px] grid place-content-center rounded-full bg-card text-center">
                      <b className="text-2xl font-extrabold tracking-tight">{avgProgress}%</b><span className="text-[10px] text-foreground/55">avg progress</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2.5 text-[12.5px]">
                    <Leg c="#34b98a" label="On track" v={onTrack} />
                    <Leg c="#e0a63c" label="Needs nudge" v={needsNudge} />
                    <Leg c="#e27564" label="At risk" v={atRiskTier} />
                  </div>
                </div>
              </motion.div>

              {/* quick stats */}
              <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3">
                <Kpi tint="mint" icon={Sparkles} label="AI calls" value={fmtNum(k?.ai_calls_month ?? 0)} sub="this month" onClick={() => navigate('/analytics')} />
                <Kpi tint="plain" icon={Bell} label="Messages" value={fmtNum(k?.messages_7d ?? 0)} sub="last 7 days" onClick={() => navigate('/messaging')} />
              </motion.div>

              {/* AI suggestions */}
              <motion.div variants={fadeUp} className="rounded-3xl border border-foreground/[0.06] bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div><div className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40">AI assistant</div><h3 className="mt-0.5 text-sm font-extrabold">Suggested actions</h3></div>
                  <Sparkles className="h-4 w-4 text-[hsl(var(--brand-magenta))]" />
                </div>
                {insightQ.data?.insights?.trim() && (
                  <Sug tint="violet" icon="✨" title="Today's insight" sub={firstLine(insightQ.data.insights)} onClick={() => navigate('/analytics')} />
                )}
                {riskN > 0 && <Sug tint="pink" icon="🍽️" title={`Nudge ${riskN} quiet client${riskN === 1 ? '' : 's'}`} sub={atRisk.slice(0, 3).map((c: any) => (c.display_name || c.name)).join(', ')} onClick={() => navigate('/messaging')} />}
                <Sug tint="sky" icon="🗓️" title="Check today's schedule" sub="Confirm appointments & sessions" onClick={() => navigate('/appointments')} />
              </motion.div>
            </div>

            {/* COLUMN C */}
            <div className="flex flex-col gap-3.5">
              {/* recent clients */}
              <motion.div variants={fadeUp} className="rounded-3xl border border-foreground/[0.06] bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between"><h3 className="text-sm font-extrabold">Recent clients</h3>
                  <button onClick={() => navigate('/clients')} className="text-foreground/40">•••</button></div>
                <div className="mt-3 flex flex-col gap-2">
                  {clients.length === 0 && <Empty text="No clients yet." />}
                  {clients.slice(0, 4).map((c, i) => {
                    const nm = (c as any).display_name || c.name;
                    return (
                      <button key={c.id} onClick={() => navigate(`/clients/${clientSlug(c)}`)} className="flex items-center gap-2.5 text-left">
                        <div className="grid h-9 w-9 place-items-center rounded-xl text-[12px] font-extrabold text-white" style={{ background: AVATAR[i % AVATAR.length] }}>{initialsOf(nm)}</div>
                        <div className="min-w-0"><div className="truncate text-[12.5px] font-bold">{nm}</div><div className="truncate text-[10.5px] text-foreground/55">{(c as any).program_type || 'Client'}</div></div>
                        <ArrowRight className="ml-auto h-3.5 w-3.5 text-foreground/25" />
                      </button>
                    );
                  })}
                </div>
              </motion.div>

              {/* practice pulse */}
              <motion.div variants={fadeUp} className="rounded-3xl border border-foreground/[0.06] bg-card p-4 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40">Practice pulse</div>
                <h3 className="mt-0.5 text-sm font-extrabold">How's the practice doing?</h3>
                <div className="grid place-items-center py-2">
                  <div className="relative h-[150px] w-[150px]">
                    <svg width="150" height="150" viewBox="0 0 150 150" className="-rotate-90">
                      <defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="hsl(var(--brand-blue))" /><stop offset="1" stopColor="hsl(var(--brand-magenta))" /></linearGradient></defs>
                      <circle cx="75" cy="75" r="63" fill="none" stroke="currentColor" className="text-foreground/10" strokeWidth="13" />
                      <circle cx="75" cy="75" r="63" fill="none" stroke="url(#pg)" strokeWidth="13" strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 63} strokeDashoffset={2 * Math.PI * 63 * (1 - pulse / 100)} />
                    </svg>
                    <div className="absolute inset-0 grid place-content-center text-center">
                      <b className="text-[30px] font-extrabold tracking-tight">{pulse}</b>
                      <span className="text-[11px] text-foreground/55">{pulse >= 70 ? 'Healthy' : pulse >= 45 ? 'Steady' : 'Needs care'}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => navigate('/analytics')}
                  className="mt-1 w-full rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] py-3 text-[13.5px] font-extrabold text-white shadow-md">
                  Open analytics
                </button>
              </motion.div>

              {/* entry cards */}
              <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3">
                <Entry icon={ClipboardCheck} label="Assessments" onClick={() => navigate('/assessments')} />
                <Entry icon={Camera} label="Plate review" onClick={() => navigate('/plate-vision')} />
                <Entry icon={ChefHat} label="Nutrition" onClick={() => navigate('/dashboard/nutrition/foods')} />
                <Entry icon={CreditCard} label="Billing" onClick={() => navigate('/billing')} />
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────── */
const AVATAR = ['#E4749B', '#5AA9D6', '#D9A15C', '#3FAE88', '#9B7BD6'];
const TINT: Record<string, string> = {
  teal: 'bg-teal-100 text-teal-950 dark:bg-teal-500/15 dark:text-teal-50',
  sky: 'bg-sky-100 text-sky-950 dark:bg-sky-500/15 dark:text-sky-50',
  violet: 'bg-violet-100 text-violet-950 dark:bg-violet-500/15 dark:text-violet-50',
  amber: 'bg-amber-100 text-amber-950 dark:bg-amber-500/15 dark:text-amber-50',
  mint: 'bg-emerald-100 text-emerald-950 dark:bg-emerald-500/15 dark:text-emerald-50',
  pink: 'bg-pink-100 dark:bg-pink-500/15',
  plain: 'bg-foreground/[0.04] text-foreground',
};

function Kpi({ tint, icon: Icon, label, value, sub, onClick }: { tint: string; icon: ComponentType<{ className?: string }>; label: string; value: string; sub: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={cn('relative rounded-2xl border border-foreground/[0.05] p-3.5 text-left', TINT[tint])}>
      <div className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-lg bg-white/45 dark:bg-black/20"><Icon className="h-3.5 w-3.5" /></div>
      <div className="text-[11px] font-bold opacity-85">{label}</div>
      <div className="mt-1.5 text-[26px] font-extrabold tracking-tight">{value}</div>
      <div className="mt-0.5 text-[11px] opacity-70">{sub}</div>
    </button>
  );
}
function Leg({ c, label, v }: { c: string; label: string; v: number }) {
  return <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 flex-none rounded" style={{ background: c }} />{label}<b className="ml-auto font-extrabold">{v}</b></div>;
}
function Sug({ tint, icon, title, sub, onClick }: { tint: string; icon: string; title: string; sub: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="mt-2.5 flex w-full items-start gap-2.5 rounded-2xl border border-foreground/[0.05] bg-foreground/[0.02] p-2.5 text-left transition hover:bg-foreground/[0.04]">
      <span className={cn('grid h-7 w-7 flex-none place-items-center rounded-lg text-[15px]', TINT[tint])}>{icon}</span>
      <span className="min-w-0"><span className="block truncate text-[12.5px] font-bold">{title}</span><span className="block truncate text-[11.5px] text-foreground/55">{sub}</span></span>
      <span className="ml-auto self-center text-foreground/30">›</span>
    </button>
  );
}
function Entry({ icon: Icon, label, onClick }: { icon: ComponentType<{ className?: string }>; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] p-3 text-left transition hover:bg-foreground/[0.04]">
      <Icon className="h-4 w-4 text-[hsl(var(--brand-blue))]" /><span className="text-[12.5px] font-bold">{label}</span>
    </button>
  );
}
function Empty({ text }: { text: string }) { return <div className="py-4 text-center text-xs text-foreground/45">{text}</div>; }

/* ── helpers ─────────────────────────────────────────────────────────── */
function initialsOf(name: string): string {
  return (name || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
}
function timeOfDay(): string { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; }
function fmtNum(n: number): string { return (n ?? 0).toLocaleString('en-IN'); }
function firstLine(s: string): string { const t = s.trim().replace(/^[•\-\s]+/, ''); return t.split('\n')[0].slice(0, 90); }
function lastSeen(iso: string | null | undefined): string {
  if (!iso) return 'no activity';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`;
}
function weekDates(): Array<{ n: string; lbl: string; today: boolean }> {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() + (i - 2));
    return { n: String(d.getDate()).padStart(2, '0'), lbl: days[d.getDay()], today: i === 2 };
  });
}
