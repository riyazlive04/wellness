import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AdminHeader, adminBtnIcon, adminBtnSolid } from './AdminHeader';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Download, Loader2, RefreshCw, Rocket, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { adminApi } from '@/modules/super-admin/api/admin';
import { overviewApi, type OverviewPractice } from '@/modules/super-admin/api/overview';

const PLAN: Record<string, string> = { starter: 'Starter', growth: 'Growth', scale_pro: 'Scale Pro', trial: 'Trial', basic: 'Basic', pro: 'Pro', elite: 'Elite' };
const COLORS = ['#2f8f46', '#1f6fb2', '#6b46c1', '#b7791f', '#0f766e', '#c0392b', '#9d174d', '#4d7c0f'];

type Status = 'active' | 'suspended' | 'deleted' | 'all';
type Stage = 'trial' | 'ended' | 'paying' | 'free' | 'other';
type Sort = 'last' | 'newest' | 'clients' | 'trial' | 'name';

const daysLeft = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null);
const stageOf = (p: OverviewPractice): Stage => {
  if (p.kind === 'paying' || p.kind === 'free') return p.kind;
  if (p.kind === 'trial') return (daysLeft(p.trial_ends_at) ?? 0) > 0 ? 'trial' : 'ended';
  return 'other';
};
const verifOf = (p: OverviewPractice) => (p.verification === 'verified' ? 'verified' : p.verification === 'pending' ? 'pending' : 'none');
const initials = (s: string) => s.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
const colorFor = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
function ago(iso: string | null): string {
  if (!iso) return '—';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return m < 1 ? 'just now' : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 60 ? `${d} d ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STAGES: Array<[Stage, string]> = [['trial', 'On trial'], ['ended', 'Trial ended'], ['paying', 'Paying'], ['free', 'Free / internal'], ['other', 'Other']];
const HEALTH: Array<[OverviewPractice['health'], string]> = [['good', 'Active clients'], ['new', 'New this week'], ['quiet', 'Quiet 7+ days']];
const VERIF: Array<['verified' | 'pending' | 'none', string]> = [['verified', 'Verified'], ['pending', 'Waiting for review'], ['none', 'Not verified']];

/**
 * Super admin Workspaces directory: filters with counts on the left, a compact
 * sortable list of every practice on the right. Data comes from one request;
 * filtering and sorting happen in the browser.
 */
export default function AdminWorkspaces() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'workspaces', 'directory'], queryFn: () => overviewApi.practices(), refetchInterval: 60_000 });
  const all = useMemo(() => q.data ?? [], [q.data]);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const [stages, setStages] = useState<Set<Stage>>(new Set());
  const [setup, setSetup] = useState<Set<'paid' | 'unpaid'>>(new Set());
  const [health, setHealth] = useState<Set<OverviewPractice['health']>>(new Set());
  const [verif, setVerif] = useState<Set<'verified' | 'pending' | 'none'>>(new Set());
  const [sort, setSort] = useState<Sort>('last');

  const term = search.trim().toLowerCase();
  const bySearchStatus = all.filter((p) =>
    (status === 'all' || p.status === status) &&
    (!term || [p.name, p.owner_name, p.owner_email, p.city, p.phone].some((v) => v?.toLowerCase().includes(term))));
  const rows = bySearchStatus
    .filter((p) => !stages.size || stages.has(stageOf(p)))
    .filter((p) => !setup.size || setup.has(p.setup_paid_inr > 0 ? 'paid' : 'unpaid'))
    .filter((p) => !health.size || health.has(p.health))
    .filter((p) => !verif.size || verif.has(verifOf(p)))
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'clients') return b.clients - a.clients;
      if (sort === 'newest') return +new Date(b.created_at) - +new Date(a.created_at);
      if (sort === 'trial') return (stageOf(a) === 'trial' ? daysLeft(a.trial_ends_at)! : 1e6) - (stageOf(b) === 'trial' ? daysLeft(b.trial_ends_at)! : 1e6);
      return +new Date(b.last_active ?? 0) - +new Date(a.last_active ?? 0);
    });

  const count = (f: (p: OverviewPractice) => boolean) => bySearchStatus.filter(f).length;
  const statusCount = (s: Status) => all.filter((p) => s === 'all' || p.status === s).length;
  const filtersOn = stages.size + setup.size + health.size + verif.size > 0 || !!term;
  const clear = () => { setStages(new Set()); setSetup(new Set()); setHealth(new Set()); setVerif(new Set()); setSearch(''); };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'workspaces'] });
    qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    qc.invalidateQueries({ queryKey: ['admin', 'platform-stats'] });
  };
  const onErr = (err: unknown) => toast.error(err instanceof ApiError ? err.message : (err as Error).message);
  const suspend = useMutation({ mutationFn: (id: string) => adminApi.suspend(id), onSuccess: () => { toast.success('Practice suspended.'); invalidate(); }, onError: onErr });
  const activate = useMutation({ mutationFn: (id: string) => adminApi.activate(id), onSuccess: () => { toast.success('Practice activated.'); invalidate(); }, onError: onErr });
  const remove = useMutation({ mutationFn: (id: string) => adminApi.softDelete(id), onSuccess: () => { toast.success('Practice deleted.'); invalidate(); }, onError: onErr });

  const exportCsv = () => {
    const head = ['Practice', 'Owner', 'Email', 'Phone', 'Status', 'Plan', 'Trial ends', 'Chosen plan', 'Setup fee (INR)', 'Clients', 'Active clients 7d', 'Meals 7d', 'Messages 7d', 'AI calls 30d', 'AI limit', 'Verification', 'Members', 'Joined', 'Last active'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((p) => [p.name, p.owner_name, p.owner_email, p.phone, p.status, stageOf(p) === 'free' ? `${PLAN[p.plan] ?? p.plan} (free)` : PLAN[p.plan] ?? p.plan, p.trial_ends_at?.slice(0, 10), p.setup_plan ? PLAN[p.setup_plan] ?? p.setup_plan : '', p.setup_paid_inr || '', p.clients, p.active_7d, p.meals_7d, p.messages_7d, p.ai_calls_30d, p.ai_limit ?? '', p.verification, p.members, p.created_at?.slice(0, 10), p.last_active?.slice(0, 10)].map(esc).join(','));
    const url = URL.createObjectURL(new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `nusi-practices-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto grid w-full max-w-[1500px] gap-4 px-4 py-6 md:px-7 md:py-8">
      <AdminHeader
        title="Workspaces"
        subtitle="Every practice on NUSI: plan, trial, setup fee, client activity, AI use and health."
        actions={
          <>
            <button type="button" onClick={() => void q.refetch()} aria-label="Refresh" className={adminBtnIcon}>
              <RefreshCw className={cn('h-4 w-4', q.isFetching && 'animate-spin')} />
            </button>
            <Link to="/admin/onboarding" className={adminBtnSolid}><Rocket className="h-4 w-4" />Onboarding link</Link>
          </>
        }
      />

      <div className="grid overflow-hidden rounded-2xl border border-foreground/[0.07] bg-card shadow-sm lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* Filters */}
        <aside className="grid content-start gap-5 border-b border-foreground/[0.07] bg-foreground/[0.02] p-4 lg:border-b-0 lg:border-r">
          <label className="flex h-9 items-center gap-2 rounded-lg border border-foreground/10 bg-background px-2.5">
            <Search className="h-4 w-4 shrink-0 text-foreground/40" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, owner, email, phone…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/40" />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><X className="h-3.5 w-3.5 text-foreground/50" /></button>}
          </label>

          <Group title="Status">
            {(['active', 'suspended', 'deleted', 'all'] as Status[]).map((s) => (
              <button key={s} type="button" onClick={() => setStatus(s)} className={cn('flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm', status === s ? 'bg-card font-semibold shadow-sm ring-1 ring-foreground/[0.06]' : 'text-foreground/75 hover:bg-foreground/[0.04]')}>
                {s === 'all' ? 'All' : s[0]!.toUpperCase() + s.slice(1)}<span className="text-xs tabular-nums text-foreground/45">{statusCount(s)}</span>
              </button>
            ))}
          </Group>
          <Group title="Plan">
            {STAGES.map(([k, l]) => <Check2 key={k} label={l} n={count((p) => stageOf(p) === k)} on={stages.has(k)} onClick={() => setStages(toggle(stages, k))} />)}
          </Group>
          <Group title="Setup fee">
            <Check2 label="Paid" n={count((p) => p.setup_paid_inr > 0)} on={setup.has('paid')} onClick={() => setSetup(toggle(setup, 'paid'))} />
            <Check2 label="Not paid" n={count((p) => !(p.setup_paid_inr > 0))} on={setup.has('unpaid')} onClick={() => setSetup(toggle(setup, 'unpaid'))} />
          </Group>
          <Group title="Health">
            {HEALTH.map(([k, l]) => <Check2 key={k} label={l} n={count((p) => p.health === k)} on={health.has(k)} onClick={() => setHealth(toggle(health, k))} />)}
          </Group>
          <Group title="Verification">
            {VERIF.map(([k, l]) => <Check2 key={k} label={l} n={count((p) => verifOf(p) === k)} on={verif.has(k)} onClick={() => setVerif(toggle(verif, k))} />)}
          </Group>
          {filtersOn && <button type="button" onClick={clear} className="justify-self-start text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300">Clear filters</button>}
        </aside>

        {/* List */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-foreground/[0.07] px-4 py-3">
            <b className="text-sm">{rows.length} practice{rows.length === 1 ? '' : 's'}</b>
            <span className="text-xs text-foreground/50">{filtersOn ? 'match your filters' : status === 'all' ? 'in total' : status}</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="ml-auto h-8 rounded-full border border-foreground/10 bg-background px-3 text-xs font-semibold outline-none">
              <option value="last">Sort: last active</option><option value="newest">Sort: newest</option><option value="clients">Sort: most clients</option><option value="trial">Sort: trial ending soonest</option><option value="name">Sort: name A–Z</option>
            </select>
            <button type="button" onClick={exportCsv} disabled={!rows.length} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/10 px-3 text-xs font-semibold hover:bg-foreground/[0.04] disabled:opacity-40"><Download className="h-3.5 w-3.5" />CSV</button>
          </div>

          {q.isLoading ? (
            <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-foreground/40" /></div>
          ) : q.isError ? (
            <div className="flex items-center justify-between gap-3 px-4 py-10 text-sm text-rose-700 dark:text-rose-300">Couldn’t load practices.<button type="button" onClick={() => void q.refetch()} className="rounded-full border border-current/30 px-3 py-1 text-xs font-semibold">Try again</button></div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-16 text-center text-sm text-foreground/50">No practices match. {filtersOn && <button type="button" onClick={clear} className="font-semibold text-teal-700 hover:underline dark:text-teal-300">Clear filters</button>}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1020px] text-sm">
                <thead><tr className="border-b border-foreground/[0.07] text-left text-[10.5px] uppercase tracking-[0.08em] text-foreground/45">
                  {['Practice', 'Plan', 'Clients', 'Meals · 7d', 'Messages · 7d', 'AI · 30d', 'Last active', 'Health', ''].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">{h}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map((p) => (
                    <Row key={p.id} p={p}
                      onSuspend={() => { if (confirm(`Suspend "${p.name}"? Everyone in this practice (staff and clients) is locked out until you activate it again.`)) suspend.mutate(p.id); }}
                      onActivate={() => activate.mutate(p.id)}
                      onDelete={() => { if (confirm(`Delete "${p.name}"? Everyone in this practice (staff and clients) is locked out. Data is kept.`)) remove.mutate(p.id); }}
                      busy={suspend.isPending || activate.isPending || remove.isPending} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ p, onSuspend, onActivate, onDelete, busy }: { p: OverviewPractice; onSuspend: () => void; onActivate: () => void; onDelete: () => void; busy: boolean }) {
  const st = stageOf(p);
  const left = daysLeft(p.trial_ends_at);
  const dim = p.status === 'deleted';
  return (
    <tr className={cn('border-b border-foreground/[0.04] last:border-0 hover:bg-foreground/[0.02]', dim && 'opacity-55')}>
      <td className="px-3 py-3">
        <Link to={`/admin/workspaces/${p.id}`} className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] text-[13px] font-bold text-white" style={{ background: colorFor(p.id) }}>{initials(p.name)}</span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5"><b className="truncate font-semibold hover:underline">{p.name}</b>
              {p.status === 'suspended' && <Pill tone="amber">Suspended</Pill>}{p.status === 'deleted' && <Pill tone="rose">Deleted</Pill>}
              {p.verification === 'verified' && <Pill tone="sky">✓ Verified</Pill>}
            </span>
            <span className="block truncate text-xs text-foreground/50">{[p.owner_name, p.owner_email].filter(Boolean).join(' · ')}{p.members > 1 ? ` · ${p.members} members` : ''}</span>
          </span>
        </Link>
      </td>
      <td className="px-3">
        {st === 'trial' ? <Pill tone="amber">Trial · {left}d left</Pill> : st === 'ended' ? <Pill tone="rose">Trial ended</Pill> : st === 'paying' ? <Pill tone="forest">{PLAN[p.plan] ?? p.plan}</Pill> : st === 'free' ? <Pill tone="grey">Free · {PLAN[p.plan] ?? p.plan}</Pill> : <Pill tone="grey">{PLAN[p.plan] ?? p.plan}</Pill>}
        {p.setup_plan && st !== 'paying' && st !== 'free' && <span className="mt-1 block text-[11px] font-medium text-teal-700 dark:text-teal-300">then {PLAN[p.setup_plan] ?? p.setup_plan} · setup paid</span>}
      </td>
      <td className="whitespace-nowrap px-3 tabular-nums"><b>{p.clients}</b> <span className="text-xs text-foreground/45">/ {p.active_7d} active</span></td>
      <td className="px-3 tabular-nums">{p.meals_7d}</td>
      <td className="px-3 tabular-nums">{p.messages_7d}</td>
      <td className="px-3">
        {p.ai_pct === null ? <span className="tabular-nums text-foreground/60">{p.ai_calls_30d}</span> : (
          <span className="flex items-center gap-2"><span className="h-1.5 w-14 overflow-hidden rounded-full bg-foreground/[0.07]"><span className={cn('block h-full rounded-full', p.ai_pct >= 80 ? 'bg-amber-500' : 'bg-teal-600')} style={{ width: `${Math.max(p.ai_pct, p.ai_calls_30d ? 2 : 0)}%` }} /></span><span className="text-xs tabular-nums">{p.ai_pct}%</span></span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 text-foreground/60">{ago(p.last_active)}</td>
      <td className="px-3">{p.health === 'good' ? <Pill tone="green">Active</Pill> : p.health === 'new' ? <Pill tone="sky">New</Pill> : p.health === 'quiet' ? <Pill tone="amber">Quiet</Pill> : <span className="text-foreground/35">—</span>}</td>
      <td className="px-3">
        <span className="flex items-center justify-end gap-1">
          <Link to={`/admin/workspaces/${p.id}`} className="rounded-full border border-foreground/10 px-3 py-1 text-xs font-semibold hover:bg-foreground/[0.04]">View</Link>
          {p.status === 'active' && <IconBtn label="Suspend" onClick={onSuspend} disabled={busy} className="hover:bg-amber-500/10 hover:text-amber-600"><Ban className="h-3.5 w-3.5" /></IconBtn>}
          {p.status === 'suspended' && <IconBtn label="Activate" onClick={onActivate} disabled={busy} className="hover:bg-teal-500/10 hover:text-teal-600"><Check className="h-3.5 w-3.5" /></IconBtn>}
          {p.status !== 'deleted' && <IconBtn label="Delete" onClick={onDelete} disabled={busy} className="hover:bg-rose-500/10 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></IconBtn>}
        </span>
      </td>
    </tr>
  );
}

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v); else next.add(v);
  return next;
}
function Group({ title, children }: { title: string; children: ReactNode }) {
  return <div className="grid gap-0.5"><span className="mb-1 px-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-foreground/45">{title}</span>{children}</div>;
}
function Check2({ label, n, on, onClick }: { label: string; n: number; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm text-foreground/80 hover:bg-foreground/[0.04]">
      <span className="flex items-center gap-2">
        <span className={cn('grid h-4 w-4 place-items-center rounded-[5px] border', on ? 'border-teal-600 bg-teal-600 text-white' : 'border-foreground/25')}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>{label}
      </span>
      <span className="text-xs tabular-nums text-foreground/45">{n}</span>
    </button>
  );
}
function IconBtn({ label, onClick, disabled, className, children }: { label: string; onClick: () => void; disabled?: boolean; className?: string; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={cn('grid h-7 w-7 place-items-center rounded-full text-foreground/45 disabled:opacity-40', className)}>{children}</button>;
}
function Pill({ tone, children }: { tone: 'green' | 'amber' | 'rose' | 'sky' | 'grey' | 'forest'; children: ReactNode }) {
  const cls = {
    green: 'bg-teal-500/12 text-teal-700 dark:text-teal-300', amber: 'bg-amber-400/15 text-amber-700 dark:text-amber-300', rose: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
    sky: 'bg-sky-500/12 text-sky-700 dark:text-sky-300', grey: 'bg-foreground/[0.06] text-foreground/70', forest: 'bg-teal-700 text-teal-100',
  }[tone];
  return <span className={cn('inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', cls)}>{children}</span>;
}
