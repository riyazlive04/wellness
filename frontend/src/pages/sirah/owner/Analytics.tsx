import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Users, Activity, Sparkles, TrendingUp, Wallet, ClipboardList, Loader2, Download, Flame,
  CreditCard, CalendarDays, AlertTriangle, CheckCircle2, ChevronRight, Lock,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { analyticsApi, type AtRiskClient } from '@/modules/workspace/api/analytics';
import { useScope } from '@/hooks/useScope';
import { featuresOf } from '@/lib/planCapabilities';
import { cn } from '@/lib/utils';

// Ocean-teal chart palette — readable in both light and dark themes.
const CHART = { teal: '#14b8a6', sky: '#0ea5e9', emerald: '#10b981' } as const;
const ENGAGE_COLORS = ['#14b8a6', '#94a3b8'];
const AXIS = { fontSize: 11, stroke: 'currentColor', opacity: 0.5 };

export default function OwnerAnalytics() {
  const { t } = useTranslation('ownerAnalytics');
  const ws = readWorkspace();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);

  // Revenue breakdown is Scale Pro only. Gate the query so a Growth workspace
  // never fires a request that would 402, and lock the section in the UI.
  const { data: scope } = useScope();
  const canRevenue = featuresOf(scope).includes('revenue_analytics');

  const overviewQ = useQuery({ queryKey: ['analytics', 'overview'], queryFn: analyticsApi.overview });
  const growthQ = useQuery({ queryKey: ['analytics', 'growth'], queryFn: () => analyticsApi.clientGrowth(6) });
  const engagementQ = useQuery({ queryKey: ['analytics', 'engagement'], queryFn: () => analyticsApi.engagement(30) });
  const nutritionQ = useQuery({ queryKey: ['analytics', 'nutrition'], queryFn: () => analyticsApi.nutritionTrends(30) });
  const programsQ = useQuery({ queryKey: ['analytics', 'programs'], queryFn: analyticsApi.programPerformance });
  const aiQ = useQuery({ queryKey: ['analytics', 'ai'], queryFn: () => analyticsApi.aiUsage(14) });
  const atRiskQ = useQuery({ queryKey: ['analytics', 'at-risk'], queryFn: () => analyticsApi.atRisk(10) });
  const revenueQ = useQuery({ queryKey: ['analytics', 'revenue'], queryFn: analyticsApi.revenue, enabled: canRevenue });
  const opsQ = useQuery({ queryKey: ['analytics', 'ops'], queryFn: analyticsApi.ops });

  const atRisk = atRiskQ.data ?? [];
  const plans = revenueQ.data?.plan_breakdown ?? [];
  const mrrTrend = revenueQ.data?.mrr_trend ?? [];
  const hasRevenue = mrrTrend.some((t) => t.mrr_inr > 0) || plans.length > 0;
  const maxPlanMrr = Math.max(1, ...plans.map((p) => p.mrr_inr));
  const ops = opsQ.data;

  const o = overviewQ.data;
  const nutrition = nutritionQ.data; // still used by the PDF export

  // Client engagement snapshot — how much of the roster is actually active (7d).
  const dormantClients = o ? Math.max(0, o.total_clients - o.active_7d) : 0;
  const engagementData = [
    { name: 'Engaged', value: o?.active_7d ?? 0 },
    { name: 'Dormant', value: dormantClients },
  ];
  const engagedPct = o && o.total_clients > 0 ? Math.round((o.active_7d / o.total_clients) * 100) : 0;

  async function exportPdf() {
    setExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      let y = 56;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
      doc.text(t('pdf.reportTitle', { practice: ws.practiceName }), 48, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(120);
      y += 18; doc.text(new Date().toLocaleString('en-IN'), 48, y);
      doc.setTextColor(20); y += 28; doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text(t('pdf.keyMetrics'), 48, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      const lines = o ? [
        t('pdf.metricsLine1', { total: o.total_clients, active: o.active_clients, newMonth: o.new_clients_month }),
        t('pdf.metricsLine2', { active7d: o.active_7d, programs: o.active_programs, progress: o.avg_program_progress }),
        t('pdf.metricsLine3', { aiCalls: o.ai_calls_month, messages: o.messages_7d, mrr: o.mrr_inr.toLocaleString('en-IN') }),
      ] : [t('pdf.noData')];
      lines.forEach((l) => { y += 18; doc.text(l, 48, y); });
      if (nutrition) { y += 26; doc.text(t('pdf.nutritionLine', { protein: nutrition.protein_g, carbs: nutrition.carb_g, fat: nutrition.fat_g, kcal: nutrition.avg_daily_kcal, meals: nutrition.meal_count }), 48, y, { maxWidth: 500 }); }
      doc.save(`analytics-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch { toast.error(t('pdf.exportFailed')); }
    finally { setExporting(false); }
  }

  return (
    <OwnerLayout practiceName={ws.practiceName} ownerName={ws.ownerName} initials={ws.initials}
      trialDaysLeft={null} topbarContext="Analytics">
      <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-6">
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">{t('header.eyebrow')}</span>
              <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight md:text-4xl">{t('header.title')}</h1>
              <p className="mt-1.5 text-sm text-foreground/55">{t('header.subtitle')}</p>
            </div>
            <button type="button" onClick={exportPdf} disabled={exporting}
              className="inline-flex items-center gap-2 self-start rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 cta-glow">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {t('header.exportReport')}
            </button>
          </motion.div>

          {/* KPIs */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KPICard icon={Users} label={t('kpi.clients')} value={String(o?.total_clients ?? 0)} hint={t('kpi.clientsHint', { active: o?.active_clients ?? 0, added: o?.new_clients_month ?? 0 })} accent="indigo" />
            <KPICard icon={Activity} label={t('kpi.active7d')} value={String(o?.active_7d ?? 0)} hint={t('kpi.active7dHint')} accent="sage" />
            <KPICard icon={ClipboardList} label={t('kpi.programs')} value={String(o?.active_programs ?? 0)} hint={t('kpi.programsHint', { progress: o?.avg_program_progress ?? 0 })} accent="sand" />
            <KPICard icon={Wallet} label={t('kpi.mrr')} value={`₹${(o?.mrr_inr ?? 0).toLocaleString('en-IN')}`} hint={t('kpi.mrrHint')} accent="sage" />
          </motion.div>

          {/* Growth + engagement */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard title={t('charts.clientGrowth')} icon={TrendingUp} loading={growthQ.isLoading} empty={(growthQ.data ?? []).length === 0}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={growthQ.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                  <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                  <Tooltip contentStyle={TOOLTIP} cursor={{ fill: 'currentColor', opacity: 0.04 }} />
                  <Bar dataKey="count" name={t('charts.newClients')} fill={CHART.teal} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t('charts.dailyActive')} icon={Flame} loading={engagementQ.isLoading} empty={(engagementQ.data ?? []).length === 0}>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={engagementQ.data ?? []}>
                  <defs><linearGradient id="eng" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART.teal} stopOpacity={0.4} /><stop offset="100%" stopColor={CHART.teal} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                  <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(d) => String(d).slice(5)} interval={5} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                  <Tooltip contentStyle={TOOLTIP} />
                  <Area type="monotone" dataKey="active" stroke={CHART.teal} strokeWidth={2.5} fill="url(#eng)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </motion.div>

          {/* Engagement + AI usage */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard title={t('charts.engagement')} icon={Activity} loading={overviewQ.isLoading} empty={!o || o.total_clients === 0}>
              <div className="flex items-center gap-4">
                <div className="relative" style={{ width: '55%' }}>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={engagementData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2}>
                        {engagementData.map((_, i) => <Cell key={i} fill={ENGAGE_COLORS[i]} />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP} formatter={(v: number) => t('charts.clientCount', { count: v })} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-extrabold tabular-nums">{engagedPct}%</span>
                    <span className="text-[10px] uppercase tracking-wide text-foreground/50">{t('charts.active')}</span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-2 text-sm">
                  <div className="flex items-center gap-2 rounded-xl bg-teal-50 px-3 py-2 dark:bg-teal-500/10">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: ENGAGE_COLORS[0] }} />
                    <span className="text-foreground/70">{t('charts.engaged')}</span><span className="ml-auto font-extrabold tabular-nums">{o?.active_7d ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-foreground/[0.03] px-3 py-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: ENGAGE_COLORS[1] }} />
                    <span className="text-foreground/70">{t('charts.dormant')}</span><span className="ml-auto font-extrabold tabular-nums">{dormantClients}</span>
                  </div>
                  <div className="pt-0.5 text-xs text-foreground/55">{t('charts.engagementFooter', { added: o?.new_clients_month ?? 0, messages: o?.messages_7d ?? 0 })}</div>
                </div>
              </div>
            </ChartCard>

            <ChartCard title={t('charts.aiUsage')} icon={Sparkles} loading={aiQ.isLoading} empty={(aiQ.data?.daily ?? []).every((d) => d.calls === 0)}>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={aiQ.data?.daily ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                  <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(d) => String(d).slice(5)} interval={3} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                  <Tooltip contentStyle={TOOLTIP} />
                  <Line type="monotone" dataKey="calls" stroke={CHART.sky} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </motion.div>

          {/* Program performance */}
          <motion.div variants={fadeUp}>
            <ChartCard title={t('charts.programPerformance')} icon={ClipboardList} loading={programsQ.isLoading} empty={(programsQ.data?.by_status ?? []).length === 0}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(programsQ.data?.by_status ?? []).map((s) => (
                  <div key={s.status} className="rounded-2xl border border-teal-100 bg-teal-50 p-3.5 dark:border-teal-500/15 dark:bg-teal-500/10">
                    <div className="text-[10px] font-bold uppercase tracking-wide capitalize text-teal-700 dark:text-teal-300">{s.status}</div>
                    <div className="mt-1 text-2xl font-extrabold tabular-nums text-teal-950 dark:text-teal-50">{s.count}</div>
                    <div className="text-[11px] text-teal-700/70 dark:text-teal-200/60">{t('charts.avgProgress', { progress: s.avg_progress })}</div>
                  </div>
                ))}
              </div>
            </ChartCard>
          </motion.div>

          {/* Revenue: MRR trend + plan breakdown — Scale Pro only */}
          {!canRevenue ? (
            <motion.div variants={fadeUp}>
              <div className="flex flex-col items-center gap-3 rounded-3xl border border-foreground/[0.06] bg-card p-8 text-center shadow-sm">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-md">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center justify-center gap-2 text-sm font-extrabold">
                    <Wallet className="h-4 w-4 text-[hsl(var(--brand-blue))]" /> {t('revenueLock.title')}
                  </div>
                  <p className="mx-auto mt-1.5 max-w-md text-xs text-foreground/60">
                    {t('revenueLock.descriptionBefore')}<span className="font-bold text-foreground/80">{t('revenueLock.planName')}</span>{t('revenueLock.descriptionAfter')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/billing')}
                  className="rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-xs font-bold text-white shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98] cta-glow"
                >
                  {t('revenueLock.upgrade')}
                </button>
              </div>
            </motion.div>
          ) : (
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
              <SectionHead icon={Wallet} title={t('revenue.trendTitle')} />
              {revenueQ.isLoading ? (
                <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
              ) : hasRevenue ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={mrrTrend}>
                    <defs><linearGradient id="mrr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART.emerald} stopOpacity={0.4} /><stop offset="100%" stopColor={CHART.emerald} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                    <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(m) => String(m).slice(5)} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `₹${v}`} />
                    <Tooltip contentStyle={TOOLTIP} formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, t('revenue.mrrLabel')]} />
                    <Area type="monotone" dataKey="mrr_inr" stroke={CHART.emerald} strokeWidth={2.5} fill="url(#mrr)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="py-12 text-center text-xs text-foreground/45">{t('revenue.noRevenue')}</div>
              )}
            </div>

            <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
              <SectionHead icon={CreditCard} title={t('revenue.planBreakdown')} />
              {revenueQ.isLoading ? (
                <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
              ) : plans.length === 0 ? (
                <div className="py-12 text-center text-xs text-foreground/45">{t('revenue.noSubscriptions')}</div>
              ) : (
                <div className="space-y-3.5 pt-1">
                  {plans.map((p) => (
                    <div key={p.plan}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-bold capitalize">{p.plan}</span>
                        <span className="text-foreground/60">{t('charts.clientCount', { count: p.count })} · <span className="font-bold text-foreground/80">{t('revenue.perMonth', { amount: p.mrr_inr.toLocaleString('en-IN') })}</span></span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-foreground/[0.06]">
                        <div className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]" style={{ width: `${Math.round((p.mrr_inr / maxPlanMrr) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
          )}

          {/* Operations + at-risk clients */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
              <SectionHead icon={CalendarDays} title={t('operations.title')} />
              {opsQ.isLoading || !ops ? (
                <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">{t('operations.appointments')}</div>
                    <div className="grid grid-cols-3 gap-2">
                      <MiniStat label={t('operations.upcoming')} value={ops.appointments.upcoming} />
                      <MiniStat label={t('operations.completed')} value={ops.appointments.completed} />
                      <MiniStat label={t('operations.cancelled')} value={ops.appointments.cancelled} tone="rose" />
                    </div>
                    {ops.appointments.next_at && (
                      <div className="mt-2 text-[11px] text-foreground/55">{t('operations.next', { when: new Date(ops.appointments.next_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</div>
                    )}
                  </div>
                  <div>
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">{t('operations.assessments')}</div>
                    <div className="grid grid-cols-3 gap-2">
                      <MiniStat label={t('operations.sent')} value={ops.assessments.sent} />
                      <MiniStat label={t('operations.submitted')} value={ops.assessments.submitted} />
                      <MiniStat label={t('operations.toReview')} value={ops.assessments.awaiting_review} tone="amber" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"><AlertTriangle className="h-4 w-4" /></span>
                  <h3 className="text-sm font-extrabold tracking-tight">{t('atRisk.title')}</h3>
                </div>
                {atRisk.length > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{atRisk.length}</span>}
              </div>
              {atRiskQ.isLoading ? (
                <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
              ) : atRisk.length === 0 ? (
                <div className="grid place-items-center gap-2 py-10 text-center">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"><CheckCircle2 className="h-6 w-6" /></span>
                  <div className="text-sm font-extrabold">{t('atRisk.allEngaged')}</div>
                  <div className="text-xs text-foreground/50">{t('atRisk.allEngagedHint')}</div>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {atRisk.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => navigate(`/clients/${c.id}`)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-foreground/[0.05] bg-foreground/[0.02] px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.04]">
                        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-400/25 to-rose-400/20 text-[11px] font-bold uppercase text-amber-700 dark:text-amber-200">
                          {c.name.slice(0, 2)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold">{c.name}</div>
                          <div className="truncate text-[11px] text-foreground/50">{inactivityLabel(c, t)}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-foreground/30" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>

        </motion.div>
      </div>
    </OwnerLayout>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: 'amber' | 'rose' }) {
  const hot = !!tone && value > 0;
  return (
    <div className={cn('rounded-2xl border p-3 text-center',
      hot && tone === 'amber' ? 'border-amber-200/70 bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10'
      : hot && tone === 'rose' ? 'border-rose-200/70 bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10'
      : 'border-teal-100 bg-teal-50 dark:border-teal-500/15 dark:bg-teal-500/10')}>
      <div className={cn('text-xl font-extrabold tabular-nums',
        hot && tone === 'amber' ? 'text-amber-700 dark:text-amber-300'
        : hot && tone === 'rose' ? 'text-rose-700 dark:text-rose-300'
        : 'text-teal-950 dark:text-teal-50')}>{value}</div>
      <div className={cn('text-[10px] font-bold uppercase tracking-wide',
        hot && tone === 'amber' ? 'text-amber-700/70 dark:text-amber-200/60'
        : hot && tone === 'rose' ? 'text-rose-700/70 dark:text-rose-200/60'
        : 'text-teal-700/70 dark:text-teal-200/60')}>{label}</div>
    </div>
  );
}

/** Human label for how long an at-risk client has been quiet. */
function inactivityLabel(c: AtRiskClient, t: TFunction): string {
  if (!c.last_meal_at) return t('atRisk.neverLogged');
  const days = Math.floor((Date.now() - new Date(c.last_meal_at).getTime()) / 86_400_000);
  return t('atRisk.noMeal', { count: days });
}

const TOOLTIP = { background: 'rgba(20,20,28,0.92)', border: 'none', borderRadius: 10, fontSize: 12, color: '#fff' } as const;

/** Section header — brand icon chip + extrabold title, optional right slot. */
function SectionHead({ icon: Icon, title, right }: { icon: typeof Users; title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-[hsl(var(--brand-blue))]/10 text-[hsl(var(--brand-blue))]">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-extrabold tracking-tight">{title}</h3>
      </div>
      {right}
    </div>
  );
}

function ChartCard({ title, icon: Icon, loading, empty, children }: {
  title: string; icon: typeof Users; loading: boolean; empty: boolean; children: React.ReactNode;
}) {
  const { t } = useTranslation('ownerAnalytics');
  return (
    <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
      <SectionHead icon={Icon} title={title} />
      {loading ? <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
        : empty ? <div className="py-12 text-center text-xs text-foreground/45">{t('charts.notEnoughData')}</div>
        : children}
    </div>
  );
}

interface WS { practiceName: string; ownerName: string; initials: string }
function readWorkspace(): WS {
  let practiceName = 'Your Practice';
  try { const raw = localStorage.getItem('sirah:workspace:draft'); if (raw) { const d = JSON.parse(raw); if (d?.practiceName) practiceName = d.practiceName; } } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName: 'You', initials };
}
