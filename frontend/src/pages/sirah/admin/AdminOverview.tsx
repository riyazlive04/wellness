import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, Megaphone, RefreshCw, Rocket } from 'lucide-react';

import { cn } from '@/lib/utils';
import { overviewApi, type AdminOverviewData, type OverviewPractice } from '@/modules/super-admin/api/overview';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat('en-IN');
const PLAN: Record<string, string> = { starter: 'Starter', growth: 'Growth', scale_pro: 'Scale Pro', trial: 'Trial', basic: 'Basic', pro: 'Pro', elite: 'Elite' };

function ago(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} d ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
const daysLeft = (iso: string | null) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)) : null);
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

/**
 * Super admin home: money, practices, onboarding, growth, client engagement,
 * AI, trials, verification, leads, activity and platform health, all live
 * from one request that refreshes every 30 seconds.
 */
export default function AdminOverview() {
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => overviewApi.get(), refetchInterval: 30_000 });
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(t); }, []);
  const d = q.data;

  return (
    <div className="mx-auto grid w-full max-w-[1500px] gap-4 px-4 py-6 md:px-7 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight">{greeting()}</h1>
          <p className="text-sm text-foreground/55">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · all practices</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <span className={cn('h-1.5 w-1.5 rounded-full', q.isError ? 'bg-rose-500' : 'bg-emerald-500')} />
            {q.isError ? 'Couldn’t refresh' : d ? `Live · updated ${ago(d.generated_at)}` : 'Loading…'}
          </span>
          <button type="button" onClick={() => void q.refetch()} aria-label="Refresh" className="grid h-9 w-9 place-items-center rounded-full border border-foreground/10 hover:bg-foreground/[0.04]">
            <RefreshCw className={cn('h-4 w-4', q.isFetching && 'animate-spin')} />
          </button>
          <Link to="/admin/announcements" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-foreground/10 px-3.5 text-sm font-semibold hover:bg-foreground/[0.04]"><Megaphone className="h-4 w-4" />Announcement</Link>
          <Link to="/admin/onboarding" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"><Rocket className="h-4 w-4" />Onboarding link</Link>
        </div>
      </div>

      {q.isLoading ? (
        <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-foreground/40" /></div>
      ) : q.isError && !d ? (
        <Card><div className="flex items-center justify-between gap-3 text-sm text-rose-700 dark:text-rose-200">Couldn’t load the overview.<button type="button" onClick={() => void q.refetch()} className="rounded-full border border-current/30 px-3 py-1 text-xs font-semibold">Try again</button></div></Card>
      ) : d ? <Body d={d} /> : null}
    </div>
  );
}

function Body({ d }: { d: AdminOverviewData }) {
  const ws = d.stats?.workspaces;
  const free = ws?.complimentary ?? 0;
  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="MRR" value={d.revenue ? INR.format(d.revenue.mrr_inr) : '—'} sub={d.revenue?.mrr_net_inr !== undefined ? `excl. GST ${INR.format(d.revenue.mrr_net_inr)}` : 'monthly recurring'} />
        <Kpi label="ARR" value={d.revenue ? INR.format(d.revenue.arr_inr) : '—'} sub="MRR × 12" />
        <Kpi label="Paying" value={ws ? NUM.format(ws.paying) : '—'} sub={ws ? `of ${ws.total - ws.deleted} practices` : ''} />
        <Kpi label="On trial" value={ws ? NUM.format(ws.trial) : '—'} sub={ws ? `${ws.trialExpiringSoon} end within 7 days` : ''} />
        <Kpi label="Free / internal" value={NUM.format(free)} sub="NUSI-own & complimentary" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <NeedsYou d={d} />
        <Onboarding d={d} />
      </section>

      <Money d={d} />
      <Practices rows={d.practices} />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Growth d={d} />
        <Card title="Client engagement" note="all practices · last 7 days">
          {d.engagement ? (
            <div className="grid grid-cols-2 gap-2.5">
              <Mini v={d.engagement.active_clients} l="Active clients" /><Mini v={d.engagement.meals} l="Meals logged" />
              <Mini v={d.engagement.messages} l="Messages" /><Mini v={d.engagement.appointments_next_7d} l="Appointments, next 7 days" />
              <Mini v={d.engagement.quick_reminders} l="Quick reminders sent" /><Mini v={d.engagement.plans_published} l="Meal plans published" />
            </div>
          ) : <Failed />}
          {d.engagement && <p className="text-xs text-foreground/55">{d.engagement.push_phones} client phone{d.engagement.push_phones === 1 ? '' : 's'} with instant notifications on</p>}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <AiCard d={d} />
        <TrialsCard d={d} />
        <LeadsCard d={d} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Activity" link={{ to: '/admin/audit', label: 'Audit log' }} note="last 30 days">
          {!d.activity ? <Failed /> : d.activity.length === 0 ? <Empty text="No activity in the last 30 days." /> : (
            <ul className="divide-y divide-foreground/[0.05]">
              {d.activity.map((a, i) => (
                <li key={i} className="flex items-start gap-3 py-2.5 text-sm">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-foreground/[0.04] text-base">{ICON[a.kind] ?? '•'}</span>
                  <div className="min-w-0"><div className="truncate">{a.text}</div><div className="text-xs text-foreground/50">{ago(a.at)}</div></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <HealthCard d={d} />
      </section>
    </>
  );
}

const ICON: Record<string, string> = { practice: '🏥', onboarding: '📝', approved: '✅', lead: '🌐', plan: '📋', client: '👥' };

function Card({ title, note, link, children, className }: { title?: string; note?: string; link?: { to: string; label: string }; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid min-w-0 content-start gap-3 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-sm', className)}>
      {(title || link) && (
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2"><h2 className="text-[15px] font-semibold">{title}</h2>{note && <span className="text-xs text-foreground/45">{note}</span>}</div>
          {link && <Link to={link.to} className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300">{link.label}</Link>}
        </div>
      )}
      {children}
    </div>
  );
}
function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-2xl border border-foreground/[0.07] bg-card p-3.5 shadow-sm">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-foreground/45">{label}</span>
      <span className="truncate text-[23px] font-extrabold tabular-nums tracking-tight">{value}</span>
      <span className={cn('truncate text-xs', accent ? 'font-semibold text-emerald-600' : 'text-foreground/50')}>{sub}</span>
    </div>
  );
}
function Mini({ v, l }: { v: number | string; l: string }) {
  return <div className="rounded-xl bg-foreground/[0.03] p-2.5"><b className="block text-lg tabular-nums">{typeof v === 'number' ? NUM.format(v) : v}</b><span className="text-xs text-foreground/60">{l}</span></div>;
}
function Pill({ tone, children }: { tone: 'green' | 'amber' | 'rose' | 'sky' | 'grey' | 'violet' | 'forest'; children: ReactNode }) {
  const cls = {
    green: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300', amber: 'bg-amber-400/15 text-amber-700 dark:text-amber-300', rose: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
    sky: 'bg-sky-500/12 text-sky-700 dark:text-sky-300', grey: 'bg-foreground/[0.06] text-foreground/70', violet: 'bg-violet-500/12 text-violet-700 dark:text-violet-300', forest: 'bg-[#123a0b] text-[#dff3c8]',
  }[tone];
  return <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', cls)}>{children}</span>;
}
const Failed = () => <p className="text-sm text-rose-700 dark:text-rose-300">Couldn’t load this part. It will retry on the next refresh.</p>;
const Empty = ({ text }: { text: string }) => <p className="text-sm text-foreground/50">{text}</p>;
const Box = ({ s, n }: { s: string; n: number }) => (
  <span className={cn('inline-grid h-[18px] w-[18px] place-items-center rounded-[5px] text-[9px] font-bold', s === 'done' ? 'bg-emerald-600 text-white' : s === 'in_progress' ? 'bg-amber-300/30 text-amber-700 dark:text-amber-300' : 'bg-foreground/[0.06] text-foreground/35')}>
    {s === 'done' ? <Check className="h-3 w-3" strokeWidth={3} /> : s === 'in_progress' ? '•' : n}
  </span>
);

function NeedsYou({ d }: { d: AdminOverviewData }) {
  const items: Array<{ tone: Parameters<typeof Pill>[0]['tone']; tag: string; title: string; sub: string; to: string; cta: string }> = [];
  (d.onboarding?.rows ?? []).filter((r) => r.status === 'submitted').forEach((r) =>
    items.push({ tone: 'green', tag: 'Approve', title: r.name, sub: `finished practice onboarding · ${ago(r.last_activity_at)}`, to: '/admin/onboarding', cta: 'Review' }));
  (d.trials ?? []).filter((t) => (daysLeft(t.trial_ends_at) ?? 99) <= 7).forEach((t) =>
    items.push({ tone: 'amber', tag: 'Trial ending', title: t.name, sub: `${daysLeft(t.trial_ends_at)} days left · ${t.clients} clients`, to: `/admin/workspaces/${t.id}`, cta: 'Open' }));
  if ((d.verification?.pending ?? 0) > 0) items.push({ tone: 'sky', tag: 'Verify', title: `${d.verification!.pending} practice${d.verification!.pending === 1 ? '' : 's'}`, sub: 'sent documents for review', to: '/admin/verifications', cta: 'Review' });
  if ((d.leads?.new_count ?? 0) > 0) items.push({ tone: 'violet', tag: 'Leads', title: `${d.leads!.new_count} new lead${d.leads!.new_count === 1 ? '' : 's'}`, sub: d.leads!.calls_soon ? `${d.leads!.calls_soon} call${d.leads!.calls_soon === 1 ? '' : 's'} booked in the next 2 days` : 'not contacted yet', to: '/admin/leads', cta: 'Open' });
  if ((d.revenue?.failed_payments ?? 0) > 0) items.push({ tone: 'rose', tag: 'Payments', title: `${d.revenue!.failed_payments} failed payment${d.revenue!.failed_payments === 1 ? '' : 's'}`, sub: 'in the last 30 days', to: '/admin/billing', cta: 'Billing' });
  if (d.health && !d.health.payments.keys) items.push({ tone: 'rose', tag: 'Payments', title: 'Razorpay not connected', sub: 'practices can’t pay yet', to: '/admin/billing', cta: 'Billing' });
  (d.ai?.top ?? []).filter((w) => w.quota_status === 'over' || w.quota_status === 'warn').forEach((w) =>
    items.push({ tone: 'amber', tag: 'AI limit', title: w.workspace_name ?? 'A practice', sub: w.quota_status === 'over' ? 'used all AI credits' : 'used 80% of AI credits', to: '/admin/ai-usage', cta: 'Open' }));
  return (
    <Card title="Needs you" note={items.length ? `${items.length}` : undefined}>
      {items.length === 0 ? <Empty text="Nothing needs you right now." /> : (
        <ul className="divide-y divide-foreground/[0.05]">
          {items.map((it, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2.5 py-2.5 text-sm">
              <Pill tone={it.tone}>{it.tag}</Pill>
              <span className="min-w-0 flex-1"><b className="font-semibold">{it.title}</b> <span className="text-xs text-foreground/50">· {it.sub}</span></span>
              <Link to={it.to} className="rounded-full border border-foreground/10 px-3 py-1 text-xs font-semibold hover:bg-foreground/[0.04]">{it.cta}</Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Onboarding({ d }: { d: AdminOverviewData }) {
  const c = d.onboarding?.counts ?? {};
  const stages: Array<[string, number, boolean]> = [
    ['Invited', (c.invited ?? 0) + (c.opened ?? 0), false],
    ['Filling in', (c.in_progress ?? 0) + (c.changes ?? 0), false],
    ['Waiting for you', c.submitted ?? 0, true],
    ['On trial', d.stats?.workspaces.trial ?? 0, false],
    ['Paying', d.stats?.workspaces.paying ?? 0, false],
  ];
  return (
    <Card title="Practice onboarding" link={{ to: '/admin/onboarding', label: 'Open' }}>
      {!d.onboarding ? <Failed /> : (<>
        <div className="grid grid-cols-5 gap-2">
          {stages.map(([l, v, hot]) => (
            <div key={l} className={cn('rounded-xl bg-foreground/[0.03] p-2.5', hot && v > 0 && 'bg-emerald-500/10 ring-1 ring-emerald-500/30')}>
              <b className="block text-xl tabular-nums">{v}</b><span className="text-[11px] leading-tight text-foreground/60">{l}</span>
            </div>
          ))}
        </div>
        {d.onboarding.rows.length === 0 ? <Empty text="No onboarding links in progress. Create one to invite a nutritionist." /> : (
          <ul className="divide-y divide-foreground/[0.05]">
            {d.onboarding.rows.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-2 text-sm">
                <b className="min-w-0 flex-1 truncate font-semibold">{r.name}</b>
                <span className="flex gap-1">{r.sections.map((s, i) => <Box key={i} s={s} n={i + 1} />)}</span>
                <span className="w-9 text-right text-xs text-foreground/50">{r.sections.filter((s) => s === 'done').length}/6</span>
              </li>
            ))}
          </ul>
        )}
      </>)}
    </Card>
  );
}

function Money({ d }: { d: AdminOverviewData }) {
  const months = d.monthly ?? [];
  const max = Math.max(1, ...months.map((m) => m.revenue_inr));
  const empty = months.every((m) => m.revenue_inr === 0);
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Card title="NUSI income" note="last 12 months, incl. GST" link={{ to: '/admin/revenue', label: 'Revenue page' }}>
        {!d.monthly ? <Failed /> : (
          <div className="relative">
            <div className="flex h-40 items-end gap-1.5 border-b border-foreground/10">
              {months.map((m) => (
                <div key={m.month} className="flex h-full flex-1 flex-col justify-end" title={`${INR.format(m.revenue_inr)} · ${m.payment_count} payments`}>
                  <div className="rounded-t-md bg-emerald-600/80" style={{ height: `${(m.revenue_inr / max) * 100}%`, minHeight: m.revenue_inr > 0 ? 3 : 0 }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1.5">{months.map((m) => <span key={m.month} className="flex-1 text-center text-[10.5px] text-foreground/45">{new Date(`${m.month}T00:00:00`).toLocaleDateString('en-IN', { month: 'short' })}</span>)}</div>
            {empty && <p className="absolute inset-x-0 top-14 text-center text-sm text-foreground/45">No NUSI income yet. Bars appear with the first payment.</p>}
          </div>
        )}
      </Card>
      <Card>
        {!d.revenue ? <Failed /> : (
          <div className="grid grid-cols-2 gap-2.5">
            <Mini v={INR.format(d.revenue.last_30d_inr)} l="Income, last 30 days" />
            <Mini v={INR.format(d.revenue.total_inr)} l="Income, all time" />
            <Mini v={d.revenue.failed_payments} l="Failed payments, 30 days" />
            <Mini v={d.revenue.checkouts_open ?? 0} l="Checkouts not paid" />
            <Mini v={INR.format(d.revenue.store_sales_30d_inr ?? 0)} l="Practice store sales (theirs)" />
            <Mini v={d.analytics ? INR.format(d.analytics.arpa_inr) : '—'} l="Average per paying practice" />
          </div>
        )}
        <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-foreground/45">Revenue by plan</span>
        <ul className="divide-y divide-foreground/[0.05] text-sm">
          {['starter', 'growth', 'scale_pro'].map((k) => {
            const p = (d.by_plan ?? []).find((x) => x.plan_key === k);
            return <li key={k} className="flex justify-between py-2"><span>{PLAN[k]}</span><span className="text-foreground/55">{p ? `${p.active_count} · ${INR.format(p.mrr_inr)}/mo` : '0 practices'}</span></li>;
          })}
        </ul>
      </Card>
    </section>
  );
}

function Practices({ rows }: { rows: OverviewPractice[] | null }) {
  return (
    <Card title="Practices" note={rows ? `${rows.length}` : undefined} link={{ to: '/admin/workspaces', label: 'All workspaces' }} className="p-2 sm:p-4">
      {!rows ? <Failed /> : rows.length === 0 ? <Empty text="No practices yet." /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead><tr className="border-b border-foreground/[0.07] text-left text-[10.5px] uppercase tracking-[0.08em] text-foreground/45">
              {['Practice', 'Status', 'Trial / plan', 'Clients', 'Meals · 7d', 'Active clients · 7d', 'AI · 30d', 'Last active', 'Health', ''].map((h) => <th key={h} className="whitespace-nowrap px-2.5 py-2 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((p) => {
                const left = daysLeft(p.trial_ends_at);
                return (
                  <tr key={p.id} className="border-b border-foreground/[0.04] last:border-0">
                    <td className="px-2.5 py-2.5"><b className="block font-semibold">{p.name}</b><span className="text-xs text-foreground/50">{[p.city, p.owner_name || p.owner_email].filter(Boolean).join(' · ')}</span></td>
                    <td className="px-2.5">{p.status === 'suspended' ? <Pill tone="rose">Suspended</Pill> : p.kind === 'paying' ? <Pill tone="forest">Paying</Pill> : p.kind === 'free' ? <Pill tone="grey">Free</Pill> : p.kind === 'trial' ? <Pill tone="amber">Trial</Pill> : <Pill tone="grey">{PLAN[p.plan] ?? p.plan}</Pill>}</td>
                    <td className="whitespace-nowrap px-2.5 text-foreground/70">{p.kind === 'paying' ? PLAN[p.plan] ?? p.plan : p.kind === 'trial' ? (left === null ? '—' : left === 0 ? 'Ended' : `${left} days left`) : p.kind === 'free' ? 'Complimentary' : '—'}</td>
                    <td className="px-2.5 tabular-nums">{p.clients}</td>
                    <td className="px-2.5 tabular-nums">{p.meals_7d}</td>
                    <td className="px-2.5 tabular-nums">{p.active_7d}</td>
                    <td className="px-2.5">
                      {p.ai_pct === null ? <span className="tabular-nums text-foreground/60">{p.ai_calls_30d}</span> : (
                        <span className="flex items-center gap-2"><span className="h-1.5 w-16 overflow-hidden rounded-full bg-foreground/[0.07]"><span className={cn('block h-full rounded-full', p.ai_pct >= 80 ? 'bg-amber-500' : 'bg-emerald-600')} style={{ width: `${p.ai_pct}%` }} /></span><span className="text-xs tabular-nums">{p.ai_pct}%</span></span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2.5 text-foreground/60">{ago(p.last_active)}</td>
                    <td className="px-2.5">{p.health === 'good' ? <Pill tone="green">Active</Pill> : p.health === 'new' ? <Pill tone="sky">New</Pill> : p.health === 'quiet' ? <Pill tone="amber">Quiet</Pill> : <Pill tone="grey">—</Pill>}</td>
                    <td className="px-2.5"><Link to={`/admin/workspaces/${p.id}`} className="rounded-full border border-foreground/10 px-3 py-1 text-xs font-semibold hover:bg-foreground/[0.04]">Open</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows && <p className="px-2 text-xs text-foreground/45">Active = a client was active or logged a meal in the last 7 days. Quiet = no client activity in 7 days.</p>}
    </Card>
  );
}

function Growth({ d }: { d: AdminOverviewData }) {
  const g = d.growth;
  const max = Math.max(1, ...(g?.weekly ?? []).map((w) => w.count));
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
  return (
    <Card title="Growth" note="new practices per week, last 12 weeks">
      {!g ? <Failed /> : (<>
        <div className="flex h-32 items-end gap-1.5 border-b border-foreground/10">
          {g.weekly.map((w, i) => (
            <div key={w.week} className="flex h-full flex-1 flex-col justify-end" title={`Week of ${w.week}: ${w.count}`}>
              <div className={cn('rounded-t-md', i === g.weekly.length - 1 ? 'bg-emerald-600' : 'bg-emerald-500/30')} style={{ height: `${(w.count / max) * 100}%`, minHeight: w.count ? 4 : 0 }} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Mini v={g.leads_30d} l="Leads · 30d" />
          <Mini v={g.onboarding_30d} l={`Onboarding · ${pct(g.onboarding_30d, g.leads_30d)}`} />
          <Mini v={d.stats?.workspaces.trial ?? 0} l="On trial now" />
          <Mini v={d.stats?.workspaces.paying ?? 0} l="Paying now" />
        </div>
        <p className="text-xs text-foreground/55">
          Trial → paid: {d.analytics && d.analytics.total_workspaces > 0 ? `${d.analytics.trial_conversion_rate}%` : '— (no trials have ended yet)'} · Cancelled in 90 days: {d.analytics?.cancelled_90d ?? 0}
        </p>
      </>)}
    </Card>
  );
}

function AiCard({ d }: { d: AdminOverviewData }) {
  const a = d.ai;
  return (
    <Card title="AI usage" note="last 30 days" link={{ to: '/admin/ai-usage', label: 'Details' }}>
      {!a ? <Failed /> : (<>
        <div className="grid grid-cols-2 gap-2.5">
          <Mini v={a.snapshot.total_calls} l="AI calls" />
          <Mini v={INR.format(a.snapshot.total_cost_inr)} l="Estimated cost" />
          <Mini v={`${a.snapshot.success_rate}%`} l="Succeeded" />
          <Mini v={a.most_used ? a.most_used.replace(/_/g, ' ') : '—'} l="Most used" />
        </div>
        <ul className="divide-y divide-foreground/[0.05] text-sm">
          {a.top.slice(0, 3).map((w) => (
            <li key={w.workspace_id} className="flex items-center justify-between gap-2 py-2"><span className="truncate">{w.workspace_name ?? '—'}</span>
              <span className="flex items-center gap-2 text-xs text-foreground/60">{NUM.format(w.calls)} calls{w.quota_status === 'warn' && <Pill tone="amber">80%+</Pill>}{w.quota_status === 'over' && <Pill tone="rose">Over</Pill>}</span></li>
          ))}
        </ul>
      </>)}
    </Card>
  );
}

function TrialsCard({ d }: { d: AdminOverviewData }) {
  const v = d.verification ?? {};
  return (
    <Card title="Trials & verification" link={{ to: '/admin/verifications', label: 'Queue' }}>
      {!d.trials ? <Failed /> : d.trials.length === 0 ? <Empty text="No trials end in the next 14 days." /> : (
        <ul className="divide-y divide-foreground/[0.05] text-sm">
          {d.trials.slice(0, 4).map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-2"><Link to={`/admin/workspaces/${t.id}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">{t.name}</Link>
              <span className="text-xs text-foreground/50">{t.clients} clients</span><Pill tone={(daysLeft(t.trial_ends_at) ?? 99) <= 3 ? 'rose' : 'amber'}>{daysLeft(t.trial_ends_at)} days</Pill></li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <Mini v={v.pending ?? 0} l="Waiting for review" />
        <Mini v={v.unsubmitted ?? 0} l="Haven’t sent documents" />
        <Mini v={v.verified ?? 0} l="Verified" />
        <Mini v={v.rejected ?? 0} l="Rejected" />
      </div>
    </Card>
  );
}

function LeadsCard({ d }: { d: AdminOverviewData }) {
  const COLORS = ['bg-violet-600', 'bg-sky-600', 'bg-emerald-600', 'bg-amber-600', 'bg-rose-600'];
  return (
    <Card title="Latest leads" note={d.leads ? `${d.leads.new_count} new` : undefined} link={{ to: '/admin/leads', label: 'All leads' }}>
      {!d.leads ? <Failed /> : d.leads.latest.length === 0 ? <Empty text="No leads yet." /> : (
        <ul className="divide-y divide-foreground/[0.05] text-sm">
          {d.leads.latest.map((l, i) => (
            <li key={l.id} className="flex items-center gap-2.5 py-2">
              <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white', COLORS[i % COLORS.length])}>{(l.name || '?').slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0"><b className="block truncate font-semibold">{l.name}</b>
                <span className="block truncate text-xs text-foreground/50">{[l.city, l.source, l.slot_start ? `call ${new Date(l.slot_start).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : (l.status ?? 'new')].filter(Boolean).join(' · ')}</span></div>
              <span className="ml-auto shrink-0 text-xs text-foreground/45">{ago(l.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function HealthCard({ d }: { d: AdminOverviewData }) {
  const h = d.health;
  const row = (ok: boolean | 'warn', label: string, detail: string) => (
    <li className="flex items-center gap-2.5 py-2 text-sm">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', ok === true ? 'bg-emerald-500' : ok === 'warn' ? 'bg-amber-500' : 'bg-rose-500')} />
      <span className="flex-1">{label}</span><span className="text-xs text-foreground/55">{detail}</span>
    </li>
  );
  const up = h ? Math.floor(h.uptime_seconds / 3600) : 0;
  return (
    <Card title="Platform health" link={{ to: '/admin/health', label: 'Details' }}>
      {!h ? <Failed /> : (
        <ul className="divide-y divide-foreground/[0.05]">
          {row(true, 'Website & API', `up · running ${up >= 24 ? `${Math.floor(up / 24)} d` : `${up} h`}`)}
          {row(h.db.up, 'Database', h.db.up ? `up · ${h.db.latency_ms} ms` : 'not responding')}
          {row(h.push ? true : 'warn', 'Instant push (Firebase)', h.push ? 'on' : 'off: phones use the slower background check')}
          {row(h.email ? true : 'warn', 'Email', h.email ? 'sending' : 'not set up')}
          {row(h.payments.keys && h.payments.webhook_secret ? (h.payments.webhook_errors_24h > 0 ? 'warn' : true) : 'warn', 'Payments (Razorpay)',
            !h.payments.keys ? 'not connected' : h.payments.webhook_errors_24h > 0 ? `${h.payments.webhook_errors_24h} webhook errors · 24 h` : h.payments.last_webhook_at ? `last event ${ago(h.payments.last_webhook_at)}` : 'connected, no events yet')}
          {row(h.ai.configured ? (h.ai.errors_24h > 5 ? 'warn' : true) : 'warn', 'AI', h.ai.configured ? `${h.ai.errors_24h} errors · 24 h` : 'no platform key')}
        </ul>
      )}
    </Card>
  );
}
