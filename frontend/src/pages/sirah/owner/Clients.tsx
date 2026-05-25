import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
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
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { InviteClientDialog } from '@/modules/workspace/clients/InviteClientDialog';
import { MOCK_CLIENTS } from '@/modules/workspace/clients/data/mockClients';
import { STATUS_META, initialsOf, relativeTime } from '@/modules/workspace/clients/helpers';
import type { Client, ClientStatus, InvitePayload } from '@/modules/workspace/clients/types';

type StatusFilter = 'all' | ClientStatus;

export default function OwnerClients() {
  const workspace = readWorkspace();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [inviteOpen, setInviteOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MOCK_CLIENTS.filter((c) => {
      if (filter !== 'all' && c.status !== filter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.program.toLowerCase().includes(q) ||
        c.specialization.toLowerCase().includes(q)
      );
    });
  }, [query, filter]);

  // Counts for the stat strip + filter chips
  const counts = useMemo(() => {
    return MOCK_CLIENTS.reduce(
      (acc, c) => {
        acc.all++;
        acc[c.status]++;
        return acc;
      },
      { all: 0, active: 0, at_risk: 0, paused: 0, pending_invite: 0 } as Record<StatusFilter, number>,
    );
  }, []);

  async function handleInvite(_payload: InvitePayload) {
    // Backend isn't booted yet — for now just resolve and let the dialog show success.
    await new Promise((r) => setTimeout(r, 500));
  }

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={`${counts.all} clients`}
      onSignOut={() => toast('Sign-out wiring lands with the auth context refactor.')}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-white/40">Clients</span>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
                Your roster
              </h1>
              <p className="mt-1 text-sm text-white/55">
                Everyone you're coaching, with their status and momentum at a glance.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="group inline-flex w-fit items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              Invite client
            </button>
          </motion.div>

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
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, program…"
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] py-2 pl-9 pr-3 text-sm placeholder:text-white/30 focus:border-violet-400/50 focus:bg-white/[0.05] focus:outline-none"
                />
              </div>
            </Glass>
          </motion.div>

          {/* Table or empty */}
          <motion.div variants={fadeUp}>
            {filtered.length === 0 ? (
              <EmptyState onInvite={() => setInviteOpen(true)} hasQuery={query.length > 0 || filter !== 'all'} />
            ) : (
              <ClientsTable rows={filtered} />
            )}
          </motion.div>
        </motion.div>
      </div>

      <InviteClientDialog open={inviteOpen} onClose={() => setInviteOpen(false)} onInvite={handleInvite} />
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
          ? 'bg-white/[0.08] text-white'
          : 'text-white/55 hover:bg-white/[0.04] hover:text-white/85'
      }`}
    >
      {status && (
        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[status].dot}`} />
      )}
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] ${
          active ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/45'
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
        <div className="grid grid-cols-[1.6fr_1.1fr_1fr_140px_120px_24px] gap-4 border-b border-white/[0.06] px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-white/40">
          <div>Client</div>
          <div>Program</div>
          <div>Status</div>
          <div>Compliance</div>
          <div>Last activity</div>
          <div></div>
        </div>

        <ul className="divide-y divide-white/[0.04]">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                to={`/clients/${c.id}`}
                className="grid grid-cols-[1.6fr_1.1fr_1fr_140px_120px_24px] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.03]"
              >
                <ClientCell client={c} />
                <ProgramCell client={c} />
                <div>
                  <StatusChip status={c.status} />
                </div>
                <ComplianceCell value={c.compliance} status={c.status} trend={c.trend} />
                <div className="text-xs text-white/55">{relativeTime(c.lastActivityAt)}</div>
                <ChevronRight className="h-4 w-4 text-white/30" />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-white/[0.04] md:hidden">
        {rows.map((c) => (
          <li key={c.id}>
            <Link to={`/clients/${c.id}`} className="flex items-center gap-3 px-5 py-3.5">
              <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-xs font-medium">
                {initialsOf(c.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{c.name}</span>
                  <StatusChip status={c.status} />
                </div>
                <div className="truncate text-xs text-white/45">
                  {c.program === '—' ? 'Awaiting onboarding' : `${c.program} · W${c.programWeek}/${c.programTotal}`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-medium text-white/85">
                  {c.status === 'pending_invite' ? '—' : `${c.compliance}%`}
                </div>
                <div className="text-[10px] text-white/40">{relativeTime(c.lastActivityAt)}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Glass>
  );
}

function ClientCell({ client }: { client: Client }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-xs font-medium">
        {initialsOf(client.name)}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-white">{client.name}</div>
        <div className="truncate text-[11px] text-white/45">{client.email}</div>
      </div>
    </div>
  );
}

function ProgramCell({ client }: { client: Client }) {
  if (client.program === '—') {
    return <span className="text-xs text-white/40">Awaiting onboarding</span>;
  }
  const pct = (client.programWeek / client.programTotal) * 100;
  return (
    <div>
      <div className="truncate text-sm text-white/85">{client.program}</div>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-1 w-20 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full bg-gradient-to-r from-blue-600 to-fuchsia-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-white/45">
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
    return <span className="text-xs text-white/35">—</span>;
  }
  const color = value >= 80 ? 'text-emerald-300' : value >= 60 ? 'text-amber-300' : 'text-rose-300';
  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm font-medium ${color}`}>{value}%</span>
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.04]">
        {trend === 'up' && <ArrowUp className="h-2.5 w-2.5 text-emerald-300" />}
        {trend === 'down' && <ArrowDown className="h-2.5 w-2.5 text-rose-300" />}
        {trend === 'flat' && <Minus className="h-2.5 w-2.5 text-white/40" />}
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
    <Glass className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-600/15 to-fuchsia-500/15">
        <UserPlus className="h-5 w-5 text-violet-300" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-medium tracking-tight">
          {hasQuery ? 'No clients match these filters' : 'No clients yet'}
        </h3>
        <p className="max-w-sm text-sm text-white/55">
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
