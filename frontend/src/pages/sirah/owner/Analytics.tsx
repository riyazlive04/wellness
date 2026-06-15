import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Users, Activity, Sparkles, TrendingUp, Wallet, ClipboardList, Loader2, Download, Flame,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { analyticsApi } from '@/modules/workspace/api/analytics';

const MACRO_COLORS = ['#7DBE9D', '#8087FF', '#F4A259'];
const AXIS = { fontSize: 11, stroke: 'currentColor', opacity: 0.5 };

export default function OwnerAnalytics() {
  const ws = readWorkspace();
  const [insights, setInsights] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [exporting, setExporting] = useState(false);

  const overviewQ = useQuery({ queryKey: ['analytics', 'overview'], queryFn: analyticsApi.overview });
  const growthQ = useQuery({ queryKey: ['analytics', 'growth'], queryFn: () => analyticsApi.clientGrowth(6) });
  const engagementQ = useQuery({ queryKey: ['analytics', 'engagement'], queryFn: () => analyticsApi.engagement(30) });
  const nutritionQ = useQuery({ queryKey: ['analytics', 'nutrition'], queryFn: () => analyticsApi.nutritionTrends(30) });
  const programsQ = useQuery({ queryKey: ['analytics', 'programs'], queryFn: analyticsApi.programPerformance });
  const aiQ = useQuery({ queryKey: ['analytics', 'ai'], queryFn: () => analyticsApi.aiUsage(14) });

  const o = overviewQ.data;
  const nutrition = nutritionQ.data;
  const macroData = nutrition
    ? [{ name: 'Protein', value: nutrition.protein_g }, { name: 'Carbs', value: nutrition.carb_g }, { name: 'Fat', value: nutrition.fat_g }]
    : [];

  async function genInsights() {
    setLoadingInsights(true);
    try { const r = await analyticsApi.insights(); setInsights(r.insights); }
    catch { toast.error('Could not generate insights.'); }
    finally { setLoadingInsights(false); }
  }

  async function exportPdf() {
    setExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      let y = 56;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
      doc.text(`${ws.practiceName} — Analytics report`, 48, y);
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
      if (insights) {
        y += 34; doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('AI insights', 48, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        doc.splitTextToSize(insights, 500).forEach((l: string) => { y += 16; if (y > 780) { doc.addPage(); y = 56; } doc.text(l, 48, y); });
      }
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

          {/* Nutrition + AI usage */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard title="Nutrition mix (30d)" icon={Activity} loading={nutritionQ.isLoading} empty={!nutrition || nutrition.meal_count === 0}>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={200}>
                  <PieChart>
                    <Pie data={macroData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {macroData.map((_, i) => <Cell key={i} fill={MACRO_COLORS[i]} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP} formatter={(v: number) => `${v} g`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 text-sm">
                  {macroData.map((m, i) => (
                    <div key={m.name} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: MACRO_COLORS[i] }} />
                      <span className="text-foreground/70">{m.name}</span><span className="font-medium">{m.value}g</span>
                    </div>
                  ))}
                  <div className="pt-1 text-xs text-foreground/55">~{nutrition?.avg_daily_kcal ?? 0} kcal/day · {nutrition?.meal_count ?? 0} meals</div>
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

          {/* AI insights */}
          <motion.div variants={fadeUp}>
            <Glass className="overflow-hidden border-violet-400/20">
              <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3">
                <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-500" /><span className="text-sm font-medium">AI insights</span></div>
                <button type="button" onClick={genInsights} disabled={loadingInsights}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                  {loadingInsights ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} {insights ? 'Regenerate' : 'Generate insights'}
                </button>
              </div>
              <div className="px-5 py-4">
                {insights
                  ? <div className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">{insights}</div>
                  : <div className="py-4 text-center text-xs text-foreground/50">Generate AI insights from your practice metrics — trends, risks, and opportunities.</div>}
              </div>
            </Glass>
          </motion.div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
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
