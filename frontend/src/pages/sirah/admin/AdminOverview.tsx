import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Info, Loader2, Megaphone, RefreshCw, Rocket, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { overviewApi, type AdminOverviewData, type OverviewPractice } from '@/modules/super-admin/api/overview';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat('en-IN');
const METHOD: Record<string, string> = { razorpay: 'Razorpay', upi: 'UPI', bank: 'Bank transfer', cash: 'Cash', other: 'Other' };
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
      {/* Brand band behind the greeting. The page below is white cards on a
          near-white canvas, so without this the whole screen reads grey. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-teal-800 to-teal-600 px-5 py-4 text-white shadow-sm md:px-6 md:py-5">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-white">{greeting()}</h1>
          <p className="text-sm text-white/70">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · all practices</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white">
            <span className={cn('h-1.5 w-1.5 rounded-full', q.isError ? 'bg-rose-300' : 'bg-teal-200')} />
            {q.isError ? 'Couldn’t refresh' : d ? `Live · updated ${ago(d.generated_at)}` : 'Loading…'}
          </span>
          <button type="button" onClick={() => void q.refetch()} aria-label="Refresh" className="grid h-9 w-9 place-items-center rounded-full border border-white/25 text-white hover:bg-white/15">
            <RefreshCw className={cn('h-4 w-4', q.isFetching && 'animate-spin')} />
          </button>
          <Link to="/admin/announcements" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/25 px-3.5 text-sm font-semibold text-white hover:bg-white/15"><Megaphone className="h-4 w-4" />Announcement</Link>
          <Link to="/admin/onboarding" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50"><Rocket className="h-4 w-4" />Onboarding link</Link>
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
  const r = d.revenue;
  const sf = d.setup_fees;
  const list = (kind: OverviewPractice['kind']) => (d.practices ?? []).filter((p) => p.kind === kind && p.status !== 'suspended');
  const byPlan = (
    <Rows rows={['starter', 'growth', 'scale_pro'].map((k) => {
      const p = (d.by_plan ?? []).find((x) => x.plan_key === k);
      return [PLAN[k], p ? `${p.active_count} practice${p.active_count === 1 ? '' : 's'} · ${INR.format(p.mrr_inr)}/mo` : '0 practices'];
    })} title="By plan" />
  );
  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi tone="money" label="MRR" value={r ? INR.format(r.mrr_inr) : '—'} sub={r?.mrr_net_inr !== undefined ? `excl. GST ${INR.format(r.mrr_net_inr)}` : 'monthly recurring'}
          title="MRR · Monthly Recurring Revenue"
          about="The subscription money NUSI earns every month from practices on a paid plan. Trials and free practices are not counted.">
          {r && <Rows rows={[['MRR (incl. 18% GST)', INR.format(r.mrr_inr)], ['GST part', INR.format(r.mrr_inr - (r.mrr_net_inr ?? r.mrr_inr))], ['What NUSI keeps (excl. GST)', INR.format(r.mrr_net_inr ?? r.mrr_inr)]]} />}
          {byPlan}
        </Kpi>
        <Kpi tone="money" label="ARR" value={r ? INR.format(r.arr_inr) : '—'} sub="MRR × 12"
          title="ARR · Annual Recurring Revenue"
          about="MRR × 12. What the subscriptions running today would bring in over a full year if nobody joins or cancels.">
          {r && <Rows rows={[['MRR', INR.format(r.mrr_inr)], ['× 12 months', INR.format(r.arr_inr)], ['Excl. GST, per year', INR.format((r.mrr_net_inr ?? r.mrr_inr) * 12)]]} />}
        </Kpi>
        <Kpi tone="pay" label="Paying" value={ws ? NUM.format(ws.paying) : '—'} sub={ws ? `of ${ws.total - ws.deleted} practices` : ''}
          title="Paying practices"
          about="Practices with an active paid subscription. Free / internal practices and trials are not included.">
          <PracticeList rows={list('paying')} empty="No practice is paying yet." right={(p) => PLAN[p.plan] ?? p.plan} />
        </Kpi>
        <Kpi tone="trial" label="On trial" value={ws ? NUM.format(ws.trial) : '—'} sub={ws ? `${ws.trialExpiringSoon} end within 7 days` : ''}
          title="Practices on trial"
          about="Practices using the free 14-day trial. When the trial ends they need to pick a paid plan to keep going.">
          <PracticeList rows={list('trial')} empty="No practice is on trial." right={(p) => { const l = daysLeft(p.trial_ends_at); const t = l === null ? '—' : l === 0 ? 'Ended' : `${l} days left`; return p.setup_plan ? `${t} · then ${PLAN[p.setup_plan] ?? p.setup_plan}` : t; }} />
        </Kpi>
        <Kpi tone="free" label="Free / internal" value={NUM.format(free)} sub="NUSI-own & complimentary"
          title="Free / internal practices"
          about="Practices NUSI gives for free: its own workspaces, demos and complimentary accounts. They have full access and never pay.">
          <PracticeList rows={list('free')} empty="No free practices." right={() => 'Complimentary'} />
        </Kpi>
        <Kpi tone="money" label="Setup fees" value={sf ? INR.format(sf.total_inr) : '—'} sub={sf ? `${sf.count} paid · ${INR.format(sf.last_30d_inr)} in 30 days` : ''}
          title="Setup fees collected"
          about="The one-time fee a practice pays when it joins (Starter ₹4,999, Growth ₹9,999, Scale Pro ₹24,999). Includes fees paid through Razorpay and fees you recorded by hand on a practice's page. Not part of MRR.">
          {sf && <Rows rows={[['All time', INR.format(sf.total_inr)], ['Last 30 days', INR.format(sf.last_30d_inr)], ['Paid by UPI / bank / cash', INR.format(sf.manual_total_inr)], ['Through Razorpay', INR.format(sf.total_inr - sf.manual_total_inr)]]} />}
          {sf && (sf.rows.length === 0 ? <Empty text="No setup fees yet. Record one from a practice's page under Workspaces." /> : (
            <ul className="divide-y divide-foreground/[0.05] rounded-xl bg-foreground/[0.03] px-3 text-sm">
              {sf.rows.map((x) => (
                <li key={x.id} className="flex items-center gap-3 py-2">
                  <Link to={`/admin/workspaces/${x.workspace_id}`} className="min-w-0 flex-1"><b className="block truncate font-semibold hover:underline">{x.workspace_name}</b>
                    <span className="text-xs text-foreground/50">{PLAN[x.plan_key] ?? x.plan_key} · {METHOD[x.method] ?? x.method} · {new Date(x.paid_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></Link>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{INR.format(x.amount_inr)}</span>
                </li>
              ))}
            </ul>
          ))}
        </Kpi>
      </section>

      <Money d={d} />
      <Practices rows={d.practices} />

      <section className="grid gap-4 lg:grid-cols-2">
        <AiCard d={d} />
        <LeadsCard d={d} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
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
          {link && <Link to={link.to} className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300">{link.label}</Link>}
        </div>
      )}
      {children}
    </div>
  );
}
/** Headline number; click it for what it means and what's behind it. */
/**
 * A hue per meaning, so the row of numbers is scannable rather than six
 * identical grey tiles: money is brand green, trials amber (they expire),
 * paying blue, internal violet.
 */
const KPI_TONE = {
  money: { tile: 'bg-teal-500/12 border-teal-600/15', value: 'text-teal-800 dark:text-teal-200', label: 'text-teal-800/65 dark:text-teal-200/70' },
  trial: { tile: 'bg-amber-500/14 border-amber-600/15', value: 'text-amber-800 dark:text-amber-200', label: 'text-amber-800/65 dark:text-amber-200/70' },
  pay:   { tile: 'bg-sky-500/12 border-sky-600/15',     value: 'text-sky-800 dark:text-sky-200',     label: 'text-sky-800/65 dark:text-sky-200/70' },
  free:  { tile: 'bg-violet-500/12 border-violet-600/15', value: 'text-violet-800 dark:text-violet-200', label: 'text-violet-800/65 dark:text-violet-200/70' },
} as const;

function Kpi({ label, value, sub, title, about, tone = 'money', children }: { label: string; value: string; sub: string; title: string; about: string; tone?: keyof typeof KPI_TONE; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const t = KPI_TONE[tone];
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('group grid min-w-0 gap-1 rounded-2xl border p-3.5 text-left shadow-sm transition hover:-translate-y-px hover:shadow-md focus:outline-none focus-visible:shadow-md', t.tile)}>
        <span className={cn('flex items-center justify-between gap-2 text-[10.5px] font-bold uppercase tracking-[0.1em]', t.label)}>{label}<Info className="h-3.5 w-3.5 opacity-40 transition group-hover:opacity-80" /></span>
        <span className={cn('truncate text-[23px] font-extrabold tabular-nums tracking-tight', t.value)}>{value}</span>
        <span className="truncate text-xs text-foreground/55">{sub}</span>
      </button>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#0c1f08]/45 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[26px] bg-card shadow-[0_30px_80px_-20px_rgba(12,31,8,0.45)] outline-none duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <div className="relative bg-teal-700 px-6 pb-6 pt-5 text-teal-50">
              <DialogPrimitive.Close aria-label="Close" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-teal-50 transition hover:bg-white/20 focus:outline-none">
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
              <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#b5d99a]">{label}</span>
              <div className="mt-2 text-[40px] font-extrabold leading-none tabular-nums tracking-tight">{value}</div>
              <div className="mt-2 text-sm text-[#cfe6bb]">{sub}</div>
            </div>
            <div className="grid max-h-[55vh] gap-4 overflow-y-auto px-6 pb-6 pt-5">
              <div>
                <DialogPrimitive.Title className="text-[17px] font-bold tracking-tight">{title}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-sm leading-relaxed text-foreground/60">{about}</DialogPrimitive.Description>
              </div>
              {children}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
function Rows({ rows, title }: { rows: Array<[string, string]>; title?: string }) {
  return (
    <div className="grid gap-1">
      {title && <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-foreground/45">{title}</span>}
      <ul className="divide-y divide-foreground/[0.05] rounded-xl bg-foreground/[0.03] px-3 text-sm">
        {rows.map(([k, v]) => <li key={k} className="flex justify-between gap-3 py-2"><span className="text-foreground/70">{k}</span><b className="font-semibold tabular-nums">{v}</b></li>)}
      </ul>
    </div>
  );
}
function PracticeList({ rows, empty, right }: { rows: OverviewPractice[]; empty: string; right: (p: OverviewPractice) => string }) {
  if (rows.length === 0) return <Empty text={empty} />;
  return (
    <ul className="divide-y divide-foreground/[0.05] rounded-xl bg-foreground/[0.03] px-3 text-sm">
      {rows.map((p) => (
        <li key={p.id} className="flex items-center gap-3 py-2">
          <Link to={`/admin/workspaces/${p.id}`} className="min-w-0 flex-1"><b className="block truncate font-semibold hover:underline">{p.name}</b><span className="text-xs text-foreground/50">{p.clients} client{p.clients === 1 ? '' : 's'}</span></Link>
          <span className="shrink-0 text-xs font-semibold text-foreground/65">{right(p)}</span>
        </li>
      ))}
    </ul>
  );
}
/**
 * `alert` turns the tile amber once the number is non-zero: a failed payment
 * or an abandoned checkout should catch the eye, and both read as neutral in
 * a row of identical tiles.
 */
function Mini({ v, l, alert }: { v: number | string; l: string; alert?: boolean }) {
  const warn = alert && typeof v === 'number' && v > 0;
  return (
    <div className={cn('rounded-xl p-2.5', warn ? 'bg-amber-500/14' : 'bg-teal-500/[0.09]')}>
      <b className={cn('block text-lg tabular-nums', warn ? 'text-amber-800 dark:text-amber-200' : 'text-teal-800 dark:text-teal-200')}>
        {typeof v === 'number' ? NUM.format(v) : v}
      </b>
      <span className="text-xs text-foreground/60">{l}</span>
    </div>
  );
}
function Pill({ tone, children }: { tone: 'green' | 'amber' | 'rose' | 'sky' | 'grey' | 'violet' | 'forest'; children: ReactNode }) {
  const cls = {
    green: 'bg-teal-500/12 text-teal-700 dark:text-teal-300', amber: 'bg-amber-400/15 text-amber-700 dark:text-amber-300', rose: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
    sky: 'bg-sky-500/12 text-sky-700 dark:text-sky-300', grey: 'bg-foreground/[0.06] text-foreground/70', violet: 'bg-violet-500/12 text-violet-700 dark:text-violet-300', forest: 'bg-teal-700 text-teal-100',
  }[tone];
  return <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', cls)}>{children}</span>;
}
const Failed = () => <p className="text-sm text-rose-700 dark:text-rose-300">Couldn’t load this part. It will retry on the next refresh.</p>;
const Empty = ({ text }: { text: string }) => <p className="text-sm text-foreground/50">{text}</p>;

function Money({ d }: { d: AdminOverviewData }) {
  const months = d.monthly ?? [];
  const max = Math.max(1, ...months.map((m) => m.revenue_inr));
  const empty = months.every((m) => m.revenue_inr === 0);
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Card title="NUSI income" note="last 12 months, incl. GST">
        {!d.monthly ? <Failed /> : (
          <div className="relative">
            <div className="flex h-40 items-end gap-1.5 border-b border-foreground/10">
              {months.map((m) => (
                <div key={m.month} className="flex h-full flex-1 flex-col justify-end" title={`${INR.format(m.revenue_inr)} · ${m.payment_count} payments`}>
                  <div className="rounded-t-md bg-gradient-to-b from-teal-500 to-teal-700" style={{ height: `${(m.revenue_inr / max) * 100}%`, minHeight: m.revenue_inr > 0 ? 3 : 0 }} />
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
            <Mini alert v={d.revenue.failed_payments} l="Failed payments, 30 days" />
            <Mini alert v={d.revenue.checkouts_open ?? 0} l="Checkouts not paid" />
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
                    <td className="whitespace-nowrap px-2.5 text-foreground/70">{p.kind === 'paying' ? PLAN[p.plan] ?? p.plan : p.kind === 'trial' ? <>{left === null ? '—' : left === 0 ? 'Ended' : `${left} days left`}{p.setup_plan && <span className="block text-xs text-teal-700 dark:text-teal-300">then {PLAN[p.setup_plan] ?? p.setup_plan} · setup paid</span>}</> : p.kind === 'free' ? 'Complimentary' : '—'}</td>
                    <td className="px-2.5 tabular-nums">{p.clients}</td>
                    <td className="px-2.5 tabular-nums">{p.meals_7d}</td>
                    <td className="px-2.5 tabular-nums">{p.active_7d}</td>
                    <td className="px-2.5">
                      {p.ai_pct === null ? <span className="tabular-nums text-foreground/60">{p.ai_calls_30d}</span> : (
                        <span className="flex items-center gap-2"><span className="h-1.5 w-16 overflow-hidden rounded-full bg-foreground/[0.07]"><span className={cn('block h-full rounded-full', p.ai_pct >= 80 ? 'bg-amber-500' : 'bg-teal-600')} style={{ width: `${p.ai_pct}%` }} /></span><span className="text-xs tabular-nums">{p.ai_pct}%</span></span>
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

function LeadsCard({ d }: { d: AdminOverviewData }) {
  const COLORS = ['bg-violet-600', 'bg-sky-600', 'bg-teal-600', 'bg-amber-600', 'bg-rose-600'];
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

