import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Users, Activity, Sparkles, TrendingUp, Wallet, ClipboardList, Loader2, Download, Flame,
  CreditCard, CalendarDays, AlertTriangle, CheckCircle2, ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { analyticsApi, type AtRiskClient } from '@/modules/workspace/api/analytics';
import { cn } from '@/lib/utils';

const ENGAGE_COLORS = ['#7DBE9D', '#D5DAE0'];
const AXIS = { fontSize: 11, stroke: 'currentColor', opacity: 0.5 };

export default function OwnerAnalytics() {
  const ws = readWorkspace();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);

  const overviewQ = useQuery({ queryKey: ['analytics', 'overview'], queryFn: analyticsApi.overview });
  const growthQ = useQuery({ queryKey: ['analytics', 'growth'], queryFn: () => analyticsApi.clientGrowth(6) });
  const engagementQ = useQuery({ queryKey: ['analytics', 'engagement'], queryFn: () => analyticsApi.engagement(30) });
  const nutritionQ = useQuery({ queryKey: ['analytics', 'nutrition'], queryFn: () => analyticsApi.nutritionTrends(30) });
  const programsQ = useQuery({ queryKey: ['analytics', 'programs'], queryFn: analyticsApi.programPerformance });
  const aiQ = useQuery({ queryKey: ['analytics', 'ai'], queryFn: () => analyticsApi.aiUsage(14) });
  const atRiskQ = useQuery({ queryKey: ['analytics', 'at-risk'], queryFn: () => analyticsApi.atRisk(10) });
  const revenueQ = useQuery({ queryKey: ['analytics', 'revenue'], queryFn: analyticsApi.revenue });
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
      doc.text(`${ws.practiceName} - Analytics report`, 48, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(120);
      y += 18; doc.text(new Date().toLocaleString('en-IN'), 48, y);
      doc.setTextColor(20); y += 28; doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text('Key metrics', 48, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      const lines = o ? [
        `Total clients: ${o.total_clients}   ·   Active: ${o.active_clients}   ·   New this month: ${o.new_clients_month}`,
        `Active (7d): ${o.active_7d}   ·   Active programs: ${o.active_programs}   ·   Avg program progress: ${o.avg_program_progress}%`,
        `AI calls this month: ${o.ai_calls_month}   ·   Messages (7d): ${o.messages_7d}   ·   MRR: INR ${o.mrr_inr.toLocaleString('en-IN')}`,
      ] : ['No data.'];
      lines.forEach((l) => { y += 18; doc.text(l, 48, y); });
      if (nutrition) { y += 26; doc.text(`Nutrition (30d): protein ${nutrition.protein_g}g, carbs ${nutrition.carb_g}g, fat ${nutrition.fat_g}g, avg ${nutrition.avg_daily_kcal} kcal/day across ${nutrition.meal_count} meals.`, 48, y, { maxWidth: 500 }); }
      doc.save(`analytics-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch { toast.error('Export failed.'); }
    finally { setExporting(false); }
  }

  return (
    <OwnerLayout practiceName={ws.practiceName} ownerName={ws.ownerName} initials={ws.initials}
      trialDaysLeft={null} topbarContext="Analytics">
      <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-6">
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-foreground/60">Reports & Analytics</span>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Practice intelligence</h1>
              <p className="mt-1 text-sm text-foreground/60">Growth, engagement, nutrition trends, and AI-driven insights.</p>
            </div>
            <button type="button" onClick={exportPdf} disabled={exporting}
              className="inline-flex items-center gap-2 self-start rounded-full border border-foreground/10 bg-foreground/[0.03] px-4 py-2 text-sm text-foreground/80 transition-colors hover:bg-foreground/[0.06] disabled:opacity-50">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export report
            </button>
          </motion.div>

          {/* KPIs */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KPICard icon={Users} label="Clients" value={String(o?.total_clients ?? 0)} hint={`${o?.active_clients ?? 0} active · +${o?.new_clients_month ?? 0} this month`} accent="indigo" />
            <KPICard icon={Activity} label="Active (7d)" value={String(o?.active_7d ?? 0)} hint="logged a meal" accent="sage" />
            <KPICard icon={ClipboardList} label="Programs" value={String(o?.active_programs ?? 0)} hint={`${o?.avg_program_progress ?? 0}% avg progress`} accent="sand" />
            <KPICard icon={Wallet} label="MRR" value={`₹${(o?.mrr_inr ?? 0).toLocaleString('en-IN')}`} hint="active subscriptions" accent="sage" />
          </motion.div>

          {/* Growth + engagement */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard title="Client growth" icon={TrendingUp} loading={growthQ.isLoading} empty={(growthQ.data ?? []).length === 0}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={growthQ.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                  <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                  <Tooltip contentStyle={TOOLTIP} cursor={{ fill: 'currentColor', opacity: 0.04 }} />
                  <Bar dataKey="count" name="New clients" fill="#8087FF" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Daily active clients (30d)" icon={Flame} loading={engagementQ.isLoading} empty={(engagementQ.data ?? []).length === 0}>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={engagementQ.data ?? []}>
                  <defs><linearGradient id="eng" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7DBE9D" stopOpacity={0.4} /><stop offset="100%" stopColor="#7DBE9D" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                  <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(d) => String(d).slice(5)} interval={5} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                  <Tooltip contentStyle={TOOLTIP} />
                  <Area type="monotone" dataKey="active" stroke="#7DBE9D" strokeWidth={2} fill="url(#eng)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </motion.div>

          {/* Engagement + AI usage */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard title="Client engagement (7d)" icon={Activity} loading={overviewQ.isLoading} empty={!o || o.total_clients === 0}>
              <div className="flex items-center gap-4">
                <div className="relative" style={{ width: '55%' }}>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={engagementData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2}>
                        {engagementData.map((_, i) => <Cell key={i} fill={ENGAGE_COLORS[i]} />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP} formatter={(v: number) => `${v} client${v === 1 ? '' : 's'}`} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold tabular-nums">{engagedPct}%</span>
                    <span className="text-[10px] uppercase tracking-wide text-foreground/50">active</span>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: ENGAGE_COLORS[0] }} />
                    <span className="text-foreground/70">Engaged</span><span className="font-medium">{o?.active_7d ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: ENGAGE_COLORS[1] }} />
                    <span className="text-foreground/70">Dormant</span><span className="font-medium">{dormantClients}</span>
                  </div>
                  <div className="pt-1 text-xs text-foreground/55">{o?.new_clients_month ?? 0} new this month · {o?.messages_7d ?? 0} messages (7d)</div>
                </div>
              </div>
            </ChartCard>

            <ChartCard title="AI usage (14d)" icon={Sparkles} loading={aiQ.isLoading} empty={(aiQ.data?.daily ?? []).every((d) => d.calls === 0)}>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={aiQ.data?.daily ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                  <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(d) => String(d).slice(5)} interval={3} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                  <Tooltip contentStyle={TOOLTIP} />
                  <Line type="monotone" dataKey="calls" stroke="#8087FF" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </motion.div>

          {/* Program performance */}
          <motion.div variants={fadeUp}>
            <ChartCard title="Program performance" icon={ClipboardList} loading={programsQ.isLoading} empty={(programsQ.data?.by_status ?? []).length === 0}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(programsQ.data?.by_status ?? []).map((s) => (
                  <div key={s.status} className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-3">
                    <div className="text-[10px] uppercase tracking-wide capitalize text-foreground/50">{s.status}</div>
                    <div className="mt-1 text-xl font-semibold">{s.count}</div>
                    <div className="text-[11px] text-foreground/55">{s.avg_progress}% avg</div>
                  </div>
                ))}
              </div>
            </ChartCard>
          </motion.div>

          {/* Revenue: MRR trend + plan breakdown */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Glass className="p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Wallet className="h-4 w-4 text-foreground/55" /> Revenue trend (MRR, 6mo)</div>
              {revenueQ.isLoading ? (
                <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
              ) : hasRevenue ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={mrrTrend}>
                    <defs><linearGradient id="mrr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7DBE9D" stopOpacity={0.4} /><stop offset="100%" stopColor="#7DBE9D" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                    <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(m) => String(m).slice(5)} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `₹${v}`} />
                    <Tooltip contentStyle={TOOLTIP} formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'MRR']} />
                    <Area type="monotone" dataKey="mrr_inr" stroke="#7DBE9D" strokeWidth={2} fill="url(#mrr)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="py-12 text-center text-xs text-foreground/45">No recurring revenue yet - you're on the trial plan. Convert active clients to a paid plan to start tracking MRR.</div>
              )}
            </Glass>

            <Glass className="p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium"><CreditCard className="h-4 w-4 text-foreground/55" /> Plan breakdown</div>
              {revenueQ.isLoading ? (
                <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
              ) : plans.length === 0 ? (
                <div className="py-12 text-center text-xs text-foreground/45">No active subscriptions yet.</div>
              ) : (
                <div className="space-y-3 pt-1">
                  {plans.map((p) => (
                    <div key={p.plan}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium capitalize">{p.plan}</span>
                        <span className="text-foreground/60">{p.count} client{p.count === 1 ? '' : 's'} · <span className="font-medium text-foreground/80">₹{p.mrr_inr.toLocaleString('en-IN')}/mo</span></span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
                        <div className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]" style={{ width: `${Math.round((p.mrr_inr / maxPlanMrr) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Glass>
          </motion.div>

          {/* Operations + at-risk clients */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Glass className="p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium"><CalendarDays className="h-4 w-4 text-foreground/55" /> Operations</div>
              {opsQ.isLoading || !ops ? (
                <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-foreground/45">Appointments</div>
                    <div className="grid grid-cols-3 gap-2">
                      <MiniStat label="Upcoming" value={ops.appointments.upcoming} />
                      <MiniStat label="Completed" value={ops.appointments.completed} />
                      <MiniStat label="Cancelled" value={ops.appointments.cancelled} tone="rose" />
                    </div>
                    {ops.appointments.next_at && (
                      <div className="mt-2 text-[11px] text-foreground/55">Next: {new Date(ops.appointments.next_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                    )}
                  </div>
                  <div>
                    <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-foreground/45">Assessments</div>
                    <div className="grid grid-cols-3 gap-2">
                      <MiniStat label="Sent" value={ops.assessments.sent} />
                      <MiniStat label="Submitted" value={ops.assessments.submitted} />
                      <MiniStat label="To review" value={ops.assessments.awaiting_review} tone="amber" />
                    </div>
                  </div>
                </div>
              )}
            </Glass>

            <Glass className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4 text-amber-500" /> At-risk clients</div>
                {atRisk.length > 0 && <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">{atRisk.length}</span>}
              </div>
              {atRiskQ.isLoading ? (
                <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
              ) : atRisk.length === 0 ? (
                <div className="grid place-items-center gap-2 py-10 text-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                  <div className="text-sm font-medium">Everyone's engaged 🎉</div>
                  <div className="text-xs text-foreground/50">No active client has gone quiet - all logged a meal in the last 10 days.</div>
                </div>
              ) : (
                <ul className="-mx-2 divide-y divide-foreground/[0.04]">
                  {atRisk.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => navigate(`/clients/${c.id}`)}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-foreground/[0.04]">
                        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-400/25 to-rose-400/20 text-[11px] font-semibold uppercase text-amber-700 dark:text-amber-200">
                          {c.name.slice(0, 2)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{c.name}</div>
                          <div className="truncate text-[11px] text-foreground/50">{inactivityLabel(c)}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-foreground/30" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Glass>
          </motion.div>

        </motion.div>
      </div>
    </OwnerLayout>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: 'amber' | 'rose' }) {
  const hot = !!tone && value > 0;
  return (
    <div className={cn('rounded-xl border p-2.5 text-center',
      hot && tone === 'amber' ? 'border-amber-400/30 bg-amber-400/[0.06]'
      : hot && tone === 'rose' ? 'border-rose-400/30 bg-rose-400/[0.06]'
      : 'border-foreground/[0.06] bg-foreground/[0.02]')}>
      <div className={cn('text-xl font-semibold tabular-nums',
        hot && tone === 'amber' ? 'text-amber-600 dark:text-amber-400'
        : hot && tone === 'rose' ? 'text-rose-600 dark:text-rose-400' : '')}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-foreground/50">{label}</div>
    </div>
  );
}

/** Human label for how long an at-risk client has been quiet. */
function inactivityLabel(c: AtRiskClient): string {
  if (!c.last_meal_at) return 'never logged a meal';
  const days = Math.floor((Date.now() - new Date(c.last_meal_at).getTime()) / 86_400_000);
  return `no meal in ${days} day${days === 1 ? '' : 's'}`;
}

const TOOLTIP = { background: 'rgba(20,20,28,0.92)', border: 'none', borderRadius: 10, fontSize: 12, color: '#fff' } as const;

function ChartCard({ title, icon: Icon, loading, empty, children }: {
  title: string; icon: typeof Users; loading: boolean; empty: boolean; children: React.ReactNode;
}) {
  return (
    <Glass className="p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-foreground/55" /> {title}</div>
      {loading ? <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
        : empty ? <div className="py-12 text-center text-xs text-foreground/45">Not enough data yet.</div>
        : children}
    </Glass>
  );
}

interface WS { practiceName: string; ownerName: string; initials: string }
function readWorkspace(): WS {
  let practiceName = 'Your Practice';
  try { const raw = localStorage.getItem('sirah:workspace:draft'); if (raw) { const d = JSON.parse(raw); if (d?.practiceName) practiceName = d.practiceName; } } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName: 'You', initials };
}
