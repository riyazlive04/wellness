import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Plus,
  Users,
  Activity,
  AlertTriangle,
  UserPlus,
  ArrowDown,
  ArrowUp,
  Minus,
  ChevronRight,
  Download,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { PageHeader } from '@/modules/workspace/components/PageHeader';
import { InviteClientDialog } from '@/modules/workspace/clients/InviteClientDialog';
import { ImportClientsDialog } from '@/modules/workspace/clients/ImportClientsDialog';
import {
  clientsApi,
  type ClientInviteRow,
  type ClientListItem,
} from '@/modules/workspace/api/clients';
import { STATUS_META, initialsOf, relativeTime } from '@/modules/workspace/clients/helpers';
import type { Client, ClientStatus } from '@/modules/workspace/clients/types';

type StatusFilter = 'all' | ClientStatus;

export default function OwnerClients() {
  const workspace = readWorkspace();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const clientsQ = useQuery({
    queryKey: ['workspace', 'clients'],
    queryFn: () => clientsApi.list({ limit: 200 }),
    staleTime: 30_000,
  });
  const invitesQ = useQuery({
    queryKey: ['workspace', 'clients', 'invites'],
    queryFn: () => clientsApi.listInvites(),
    staleTime: 30_000,
  });

  // Adapt API rows + pending invites into the UI's Client shape.
  const allClients = useMemo<Client[]>(() => {
    const accepted = (clientsQ.data?.items ?? []).map(toUiClient);
    const pending = (invitesQ.data?.items ?? [])
      .filter((i) => i.status === 'pending')
      .map(inviteToUiClient);
    return [...accepted, ...pending];
  }, [clientsQ.data, invitesQ.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allClients.filter((c) => {
      if (filter !== 'all' && c.status !== filter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.program.toLowerCase().includes(q)
      );
    });
  }, [query, filter, allClients]);

  const counts = useMemo(() => {
    return allClients.reduce(
      (acc, c) => {
        acc.all++;
        acc[c.status]++;
        return acc;
      },
      { all: 0, active: 0, at_risk: 0, paused: 0, pending_invite: 0 } as Record<StatusFilter, number>,
    );
  }, [allClients]);

  const isLoading = clientsQ.isLoading || invitesQ.isLoading;

  function exportCsv() {
    if (filtered.length === 0) {
      toast('Nothing to export for this filter.');
      return;
    }
    const headers = ['Name', 'Email', 'Phone', 'Status', 'Program', 'Joined', 'Last active'];
    const rows = filtered.map((c) => [
      c.name,
      c.email,
      c.phone,
      c.status,
      c.program,
      fmtDate(c.joinedAt),
      fmtDate(c.lastActiveAt ?? c.lastActivityAt),
    ]);
    downloadCsv(`clients-${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
    toast.success(`Exported ${filtered.length} ${filtered.length === 1 ? 'client' : 'clients'}.`);
  }

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={`${counts.all} clients`}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          <PageHeader
            eyebrow="People · Clients"
            title="Your roster"
            description="Everyone you're coaching, with their status and momentum at a glance."
            action={
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-foreground/15 px-4 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.04]"
                >
                  <Upload className="h-4 w-4" />
                  Import
                </button>
                <button
                  type="button"
                  onClick={exportCsv}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-foreground/15 px-4 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.04]"
                >
                  <Download className="h-4 w-4" />
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => setInviteOpen(true)}
                  className="group inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(99,102,241,0.55)] transition-all hover:scale-[1.03] hover:shadow-[0_14px_36px_-10px_rgba(99,102,241,0.7)] active:scale-[0.98]"
                >
                  <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
                  Invite client
                </button>
              </div>
            }
          />

          {/* KPI strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KPICard
              icon={Users}
              label="Total clients"
              value={String(counts.all)}
              delta={{ value: '+3', direction: 'up' }}
              hint="this week"
              accent="indigo"
            />
            <KPICard
              icon={Activity}
              label="Active"
              value={String(counts.active)}
              delta={{ value: '92% adherence', direction: 'up' }}
              hint="of total"
              accent="sage"
            />
            <KPICard
              icon={AlertTriangle}
              label="Need attention"
              value={String(counts.at_risk + counts.pending_invite)}
              hint={`${counts.at_risk} at risk · ${counts.pending_invite} pending`}
              accent="sand"
            />
          </motion.div>

          {/* Filter bar */}
          <motion.div variants={fadeUp}>
            <Glass className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between md:p-4">
              <div className="flex flex-wrap items-center gap-1">
                <FilterChip label="All" count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} />
                <FilterChip
                  label="Active"
                  count={counts.active}
                  active={filter === 'active'}
                  onClick={() => setFilter('active')}
                  status="active"
                />
                <FilterChip
                  label="At risk"
                  count={counts.at_risk}
                  active={filter === 'at_risk'}
                  onClick={() => setFilter('at_risk')}
                  status="at_risk"
                />
                <FilterChip
                  label="Paused"
                  count={counts.paused}
                  active={filter === 'paused'}
                  onClick={() => setFilter('paused')}
                  status="paused"
                />
                <FilterChip
                  label="Pending"
                  count={counts.pending_invite}
                  active={filter === 'pending_invite'}
                  onClick={() => setFilter('pending_invite')}
                  status="pending_invite"
                />
              </div>

              <div className="relative w-full md:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/75 dark:text-foreground/55" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, program…"
                  className="w-full rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] py-2 pl-9 pr-3 text-sm placeholder:text-foreground/75 dark:text-foreground/60 focus:border-violet-400/50 focus:bg-foreground/[0.05] focus:outline-none"
                />
              </div>
            </Glass>
          </motion.div>

          {/* Table or empty */}
          <motion.div variants={fadeUp}>
            {isLoading ? (
              <Glass className="grid place-items-center px-6 py-14 text-sm text-foreground/55">
                Loading clients…
              </Glass>
            ) : filtered.length === 0 ? (
              <EmptyState onInvite={() => setInviteOpen(true)} hasQuery={query.length > 0 || filter !== 'all'} />
            ) : (
              <ClientsTable rows={filtered} />
            )}
          </motion.div>
        </motion.div>
      </div>

      <InviteClientDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['workspace', 'clients'] });
        }}
      />
      {importOpen && <ImportClientsDialog onClose={() => setImportOpen(false)} />}
    </OwnerLayout>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function FilterChip({
  label,
  count,
  active,
  onClick,
  status,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  status?: ClientStatus;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs transition-all ${
        active
          ? 'bg-foreground/[0.08] text-foreground'
          : 'text-foreground/75 dark:text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground/85'
      }`}
    >
      {status && (
        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[status].dot}`} />
      )}
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] ${
          active ? 'bg-foreground/15 text-foreground' : 'bg-foreground/[0.04] text-foreground/75 dark:text-foreground/60'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function ClientsTable({ rows }: { rows: Client[] }) {
  return (
    <Glass className="overflow-hidden">
      {/* Desktop table */}
      <div className="hidden md:block">
        <div className="grid grid-cols-[1.6fr_1.1fr_1fr_140px_120px_24px] gap-4 border-b border-foreground/[0.06] px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
          <div>Client</div>
          <div>Program</div>
          <div>Status</div>
          <div>Compliance</div>
          <div>Last activity</div>
          <div></div>
        </div>

        <ul className="divide-y divide-foreground/[0.04]">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                to={`/clients/${c.id}`}
                className="grid grid-cols-[1.6fr_1.1fr_1fr_140px_120px_24px] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-foreground/[0.03]"
              >
                <ClientCell client={c} />
                <ProgramCell client={c} />
                <div>
                  <StatusChip status={c.status} />
                </div>
                <ComplianceCell value={c.compliance} status={c.status} trend={c.trend} />
                <div className="text-xs text-foreground/75 dark:text-foreground/55">{relativeTime(c.lastActivityAt)}</div>
                <ChevronRight className="h-4 w-4 text-foreground/30" />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-foreground/[0.04] md:hidden">
        {rows.map((c) => (
          <li key={c.id}>
            <Link to={`/clients/${c.id}`} className="flex items-center gap-3 px-5 py-3.5">
              <div className="relative flex-shrink-0">
                <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-xs font-medium">
                  {c.avatarUrl ? <img src={c.avatarUrl} alt={c.name} className="h-full w-full object-cover" /> : initialsOf(c.name)}
                </div>
                {isOnline(c.lastActiveAt) && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-1 bg-emerald-500" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{c.name}</span>
                  <StatusChip status={c.status} />
                </div>
                <div className="truncate text-xs text-foreground/75 dark:text-foreground/60">
                  {c.program === '—' ? 'Awaiting onboarding' : `${c.program} · W${c.programWeek}/${c.programTotal}`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-medium text-foreground/85">
                  {c.status === 'pending_invite' ? '—' : `${c.compliance}%`}
                </div>
                <div className="text-[10px] text-foreground/75 dark:text-foreground/55">{relativeTime(c.lastActivityAt)}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Glass>
  );
}

function ClientCell({ client }: { client: Client }) {
  const online = isOnline(client.lastActiveAt);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative flex-shrink-0">
        <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-xs font-medium">
          {client.avatarUrl ? <img src={client.avatarUrl} alt={client.name} className="h-full w-full object-cover" /> : initialsOf(client.name)}
        </div>
        {online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-1 bg-emerald-500" title="Active now" />}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{client.name}</div>
        <div className="truncate text-[11px] text-foreground/75 dark:text-foreground/60">{client.email}</div>
      </div>
    </div>
  );
}

/** Online if a presence heartbeat landed in the last 2 minutes. */
function isOnline(lastActiveAt?: string | null): boolean {
  if (!lastActiveAt) return false;
  const ts = new Date(lastActiveAt).getTime();
  return !Number.isNaN(ts) && Date.now() - ts < 2 * 60_000;
}

function ProgramCell({ client }: { client: Client }) {
  if (client.program === '—') {
    return <span className="text-xs text-foreground/75 dark:text-foreground/55">Awaiting onboarding</span>;
  }
  const pct = (client.programWeek / client.programTotal) * 100;
  return (
    <div>
      <div className="truncate text-sm text-foreground/85">{client.program}</div>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-1 w-20 overflow-hidden rounded-full bg-foreground/[0.06]">
          <div className="h-full bg-gradient-to-r from-blue-600 to-fuchsia-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-foreground/75 dark:text-foreground/60">
          W{client.programWeek}/{client.programTotal}
        </span>
      </div>
    </div>
  );
}

function ComplianceCell({
  value,
  status,
  trend,
}: {
  value: number;
  status: ClientStatus;
  trend: 'up' | 'down' | 'flat';
}) {
  if (status === 'pending_invite') {
    return <span className="text-xs text-foreground/35">—</span>;
  }
  const color = value >= 80 ? 'text-emerald-700 dark:text-emerald-300' : value >= 60 ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300';
  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm font-medium ${color}`}>{value}%</span>
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground/[0.04]">
        {trend === 'up' && <ArrowUp className="h-2.5 w-2.5 text-emerald-700 dark:text-emerald-300" />}
        {trend === 'down' && <ArrowDown className="h-2.5 w-2.5 text-rose-700 dark:text-rose-300" />}
        {trend === 'flat' && <Minus className="h-2.5 w-2.5 text-foreground/75 dark:text-foreground/55" />}
      </span>
    </div>
  );
}

function StatusChip({ status }: { status: ClientStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] ${meta.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function EmptyState({ onInvite, hasQuery }: { onInvite: () => void; hasQuery: boolean }) {
  return (
    <Glass className="flex flex-col items-center justify-center gap-5 px-6 py-14 text-center">
      {hasQuery ? (
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-600/15 to-fuchsia-500/15">
          <UserPlus className="h-5 w-5 text-violet-700 dark:text-violet-300" />
        </div>
      ) : (
        <img
          src="/illustrations/empty-clients.png"
          alt=""
          aria-hidden
          width={200}
          height={200}
          draggable={false}
          className="h-36 w-auto select-none drop-shadow-[0_18px_36px_rgba(139,92,246,0.18)]"
        />
      )}
      <div className="space-y-1.5">
        <h3 className="text-lg font-medium tracking-tight">
          {hasQuery ? 'No clients match these filters' : 'No clients yet'}
        </h3>
        <p className="max-w-sm text-sm text-foreground/80 dark:text-foreground/65">
          {hasQuery
            ? 'Try clearing filters or your search.'
            : 'Invite your first client via WhatsApp or email. They onboard themselves and land in your roster.'}
        </p>
      </div>
      {!hasQuery && (
        <button
          type="button"
          onClick={onInvite}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.02]"
        >
          <Plus className="h-4 w-4" />
          Invite first client
        </button>
      )}
    </Glass>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

// ─── API → UI adapters ───────────────────────────────────────────────────
// The UI Client shape was designed around mock data with fields the API
// doesn't yet provide (compliance %, programWeek, trend). Map what we have,
// default the rest sensibly. As real data lands these can pull from
// adherence/program tables.

/** Format an ISO date to a short readable date; blank for missing/invalid. */
function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

/** Quote a CSV cell per RFC 4180 (wrap + double inner quotes when needed). */
function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string and trigger a client-side download. */
function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  // BOM so Excel opens UTF-8 (₹, accented names) correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toUiClient(row: ClientListItem): Client {
  // Reach into the existing ClientStatus union — API's raw status may include
  // values like 'completed' / 'archived'; coerce anything outside the UI's
  // four-value enum to 'paused'.
  const apiStatus = (row.status ?? 'active').toLowerCase();
  const uiStatus: ClientStatus =
    apiStatus === 'active' ? 'active'
      : apiStatus === 'paused' || apiStatus === 'archived' || apiStatus === 'completed'
        ? 'paused'
        : 'active';
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? '',
    status: uiStatus,
    program: row.program_type ? humanizeProgram(row.program_type) : '—',
    programWeek: 0,
    programTotal: 12,
    compliance: 0,
    lastActivityAt: row.updated_at,
    joinedAt: row.created_at,
    trend: 'flat',
    goals: [],
    specialization: row.program_type ?? '',
    avatarUrl: row.avatar_url,
    lastActiveAt: row.last_active_at,
  };
}

function inviteToUiClient(invite: ClientInviteRow): Client {
  return {
    id: `invite:${invite.id}`,
    name: invite.name ?? invite.email.split('@')[0],
    email: invite.email,
    phone: '',
    status: 'pending_invite',
    program: '—',
    programWeek: 0,
    programTotal: 12,
    compliance: 0,
    lastActivityAt: invite.created_at,
    joinedAt: invite.created_at,
    trend: 'flat',
    goals: [],
    specialization: '',
  };
}

function humanizeProgram(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface WorkspaceSummary {
  practiceName: string;
  ownerName: string;
  initials: string;
}

function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }

  const initials = practiceName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'SL';

  return { practiceName, ownerName, initials };
}
