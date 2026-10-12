import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { analyticsApi } from '@/modules/workspace/api/analytics';
import { Search, UserPlus, Link2, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { PageHeader } from '@/modules/workspace/components/PageHeader';
import { JoinLinkDialog } from '@/modules/workspace/clients/JoinLinkDialog';
import { JoinRequestsPanel } from '@/modules/workspace/clients/JoinRequestsPanel';
import { DeleteClientDialog } from '@/modules/workspace/clients/DeleteClientDialog';
import { ImportClientsDialog } from '@/modules/workspace/clients/ImportClientsDialog';
import { AddClientDialog } from '@/modules/workspace/clients/AddClientDialog';
import {
  clientsApi,
  clientSlug,
  type ClientListItem,
  type PreapprovalRow,
} from '@/modules/workspace/api/clients';
import { STATUS_META, relativeTime } from '@/modules/workspace/clients/helpers';
import { ClientAvatar, ClientPreviewPanel } from '@/modules/workspace/clients/ClientPreviewPanel';
import type { Client, ClientStatus } from '@/modules/workspace/clients/types';

type StatusFilter = 'all' | ClientStatus;

export default function OwnerClients() {
  const { t } = useTranslation('ownerClients');
  const workspace = readWorkspace();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>(
    (searchParams.get('filter') as StatusFilter) || 'all',
  );
  const [joinLinkOpen, setJoinLinkOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  // The client shown in the preview panel (wide screens); defaults to the first in the list.
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('c'));
  const isWide = useIsWide();

  const clientsQ = useQuery({
    queryKey: ['workspace', 'clients'],
    queryFn: () => clientsApi.list({ limit: 200 }),
    staleTime: 30_000,
  });
  // Imported emails that haven't signed up yet. Real clients (including
  // unapproved ones, at status 'pending') already come back from list().
  const preapprovalsQ = useQuery({
    queryKey: ['workspace', 'clients', 'preapprovals'],
    queryFn: () => clientsApi.listPreapprovals(),
    staleTime: 30_000,
  });

  // Same behavioural at-risk signal the dashboard uses (active clients with no
  // meal logged in ~10 days), so the "At risk" tab matches the Overview card.
  const atRiskQ = useQuery({ queryKey: ['analytics', 'at-risk'], queryFn: () => analyticsApi.atRisk() });
  const atRiskIds = useMemo(() => new Set((atRiskQ.data ?? []).map((c) => c.id)), [atRiskQ.data]);

  const allClients = useMemo<Client[]>(() => {
    const signedUp = (clientsQ.data?.items ?? []).map(toUiClient);
    const invited = (preapprovalsQ.data?.items ?? []).map(preapprovalToUiClient);
    return [...signedUp, ...invited];
  }, [clientsQ.data, preapprovalsQ.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allClients.filter((c) => {
      if (filter === 'at_risk') {
        if (!atRiskIds.has(c.id)) return false;
      } else if (filter !== 'all' && c.status !== filter) {
        return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.program.toLowerCase().includes(q)
      );
    });
  }, [query, filter, allClients, atRiskIds]);

  const counts = useMemo(() => {
    const base = allClients.reduce(
      (acc, c) => {
        acc.all++;
        acc[c.status]++;
        return acc;
      },
      { all: 0, active: 0, at_risk: 0, paused: 0, pending_invite: 0, declined: 0 } as Record<StatusFilter, number>,
    );
    // At-risk is a behavioural overlay (a subset of active), not a stored status.
    base.at_risk = allClients.filter((c) => atRiskIds.has(c.id)).length;
    return base;
  }, [allClients, atRiskIds]);

  const isLoading = clientsQ.isLoading || preapprovalsQ.isLoading;
  const selected = filtered.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  /**
   * Two different deletes wear one button. A preapproval is just an imported
   * email with no data behind it, so it goes immediately; a real client means
   * destroying their history, so that routes through the typed confirmation.
   */
  async function handleDelete(c: Client) {
    if (c.id.startsWith('preapproval:')) {
      const id = c.id.slice('preapproval:'.length);
      try {
        await clientsApi.removePreapproval(id);
        toast.success(t('toast.removedFromImport', { email: c.email }));
        void qc.invalidateQueries({ queryKey: ['workspace', 'clients', 'preapprovals'] });
      } catch (err) {
        toast.error((err as Error).message ?? t('toast.couldNotRemove'));
      }
      return;
    }
    setDeleting({ id: c.id, name: c.name });
  }

  function exportCsv() {
    if (filtered.length === 0) {
      toast(t('toast.nothingToExport'));
      return;
    }
    const headers = [
      t('csv.name'),
      t('csv.email'),
      t('csv.phone'),
      t('csv.status'),
      t('csv.program'),
      t('csv.joined'),
      t('csv.lastActive'),
    ];
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
    toast.success(
      t(filtered.length === 1 ? 'toast.exportedOne' : 'toast.exportedMany', { count: filtered.length }),
    );
  }

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={t('topbar.clients', { count: counts.all })}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          <PageHeader
            eyebrow={t('header.eyebrow')}
            title={t('header.title')}
            description={t('header.description')}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-foreground/15 px-4 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.04]"
                >
                  <Upload className="h-4 w-4" />
                  {t('actions.import')}
                </button>
                <button
                  type="button"
                  onClick={exportCsv}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-foreground/15 px-4 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.04]"
                >
                  <Download className="h-4 w-4" />
                  {t('common:actions.export')}
                </button>
                <button
                  type="button"
                  onClick={() => setJoinLinkOpen(true)}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-foreground/15 px-4 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.04]"
                >
                  <Link2 className="h-4 w-4" />
                  {t('actions.shareJoinLink')}
                </button>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="group inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(109,176,34,0.55)] transition-all hover:scale-[1.03] cta-glow active:scale-[0.97] hover:shadow-[0_14px_36px_-10px_rgba(109,176,34,0.7)] active:scale-[0.98]"
                >
                  <UserPlus className="h-4 w-4" />
                  Add client
                </button>
              </div>
            }
          />

          {/* Approval queue - renders only when someone is waiting */}
          <JoinRequestsPanel />

          {isLoading ? (
            <Glass className="grid place-items-center rounded-3xl px-6 py-14 text-sm text-foreground/55">
              {t('table.loading')}
            </Glass>
          ) : allClients.length === 0 ? (
            <EmptyState onInvite={() => setJoinLinkOpen(true)} hasQuery={false} />
          ) : (
            <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 lg:sticky lg:top-3 lg:h-[calc(100vh-9.5rem)] lg:grid-cols-[minmax(320px,400px)_1fr] lg:grid-rows-[minmax(0,1fr)]">
              {/* The roster */}
              <Glass className="rounded-3xl p-3 md:p-4 lg:flex lg:min-h-0 lg:flex-col">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/55" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('search.placeholder')}
                    className="w-full rounded-full border border-foreground/[0.08] bg-foreground/[0.02] py-2.5 pl-9 pr-3 text-sm placeholder:text-foreground/50 focus:border-teal-400/50 focus:bg-foreground/[0.05] focus:outline-none"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  <FilterChip label={t('filters.all')} count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} />
                  <FilterChip label={t('filters.active')} count={counts.active} active={filter === 'active'} onClick={() => setFilter('active')} status="active" />
                  <FilterChip label={t('filters.atRisk')} count={counts.at_risk} active={filter === 'at_risk'} onClick={() => setFilter('at_risk')} status="at_risk" />
                  <FilterChip label={t('filters.paused')} count={counts.paused} active={filter === 'paused'} onClick={() => setFilter('paused')} status="paused" />
                  <FilterChip label={t('filters.pending')} count={counts.pending_invite} active={filter === 'pending_invite'} onClick={() => setFilter('pending_invite')} status="pending_invite" />
                  {/* Only surfaces once someone has actually been declined. */}
                  {counts.declined > 0 && (
                    <FilterChip label={t('filters.declined')} count={counts.declined} active={filter === 'declined'} onClick={() => setFilter('declined')} status="declined" />
                  )}
                </div>
                {filtered.length === 0 ? (
                  <div className="px-3 py-10 text-center">
                    <div className="text-sm font-semibold">{t('empty.noMatchTitle')}</div>
                    <div className="mt-1 text-xs text-foreground/55">{t('empty.noMatchBody')}</div>
                  </div>
                ) : (
                  <ul className="mt-3 flex flex-col gap-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                    {filtered.map((c) => (
                      <li key={c.id}>
                        <RosterRow
                          client={c}
                          selected={isWide && selected?.id === c.id}
                          onSelect={isWide ? () => setSelectedId(c.id) : undefined}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Glass>

              {/* The selected client at a glance (wide screens; phones open the full profile) */}
              <div className="hidden min-h-0 lg:block lg:overflow-y-auto lg:rounded-3xl">
                {selected ? (
                  <ClientPreviewPanel key={selected.id} client={selected} onDelete={handleDelete} />
                ) : (
                  <Glass className="grid place-items-center rounded-3xl px-6 py-20 text-sm text-foreground/50">
                    Pick a client to see how they're doing.
                  </Glass>
                )}
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>

      <JoinLinkDialog open={joinLinkOpen} onClose={() => setJoinLinkOpen(false)} />
      <DeleteClientDialog client={deleting} onClose={() => setDeleting(null)} />
      {importOpen && (
        <ImportClientsDialog
          onClose={() => {
            setImportOpen(false);
            void qc.invalidateQueries({ queryKey: ['workspace', 'clients'] });
          }}
        />
      )}
      {addOpen && <AddClientDialog onClose={() => setAddOpen(false)} />}
    </OwnerLayout>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

/** True on screens wide enough for the list + preview layout. */
function useIsWide(): boolean {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * One client in the roster. On wide screens it selects the client for the
 * preview panel; on phones it opens their profile.
 */
function RosterRow({ client, selected, onSelect }: { client: Client; selected: boolean; onSelect?: () => void }) {
  const { t } = useTranslation('ownerClients');
  const invited = client.id.startsWith('preapproval:');
  const body = (
    <>
      {selected && <span className="absolute bottom-3 left-0 top-3 w-1 rounded-full bg-[hsl(var(--brand-blue))]" />}
      <ClientAvatar client={client} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{client.name}</span>
          <span className="flex-shrink-0 text-[11px] text-foreground/50">
            {invited ? t('filters.pending') : relativeTime(client.lastActiveAt ?? client.lastActivityAt)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-foreground/60">
            {client.program === '-' ? t('program.awaitingOnboarding') : client.program}
          </span>
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_META[client.status].dot}`} title={STATUS_META[client.status].label} />
        </div>
      </div>
    </>
  );
  const cls = `relative flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
    selected
      ? 'border-[hsl(var(--brand-blue)_/_0.35)] bg-[hsl(var(--brand-blue)_/_0.08)]'
      : 'border-transparent hover:bg-foreground/[0.04]'
  }`;
  if (onSelect) {
    return <button type="button" onClick={onSelect} aria-current={selected || undefined} className={cls}>{body}</button>;
  }
  return invited
    ? <div className={cls}>{body}</div>
    : <Link to={`/clients/${clientSlug(client.name, client.id)}`} className={cls}>{body}</Link>;
}

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
      className={`group inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition-all ${
        active
          ? 'bg-teal-100 text-teal-900 shadow-sm dark:bg-teal-500/[0.18] dark:text-teal-50'
          : 'text-foreground/75 dark:text-foreground/60 hover:bg-foreground/[0.05] hover:text-foreground/90'
      }`}
    >
      {status && (
        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[status].dot}`} />
      )}
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
          active ? 'bg-white/70 text-teal-900 dark:bg-black/20 dark:text-teal-50' : 'bg-foreground/[0.05] text-foreground/75 dark:text-foreground/60'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function EmptyState({ onInvite, hasQuery }: { onInvite: () => void; hasQuery: boolean }) {
  const { t } = useTranslation('ownerClients');
  return (
    <Glass className="flex flex-col items-center justify-center gap-5 rounded-3xl px-6 py-14 text-center">
      {hasQuery ? (
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)]">
          <UserPlus className="h-5 w-5 text-teal-700 dark:text-teal-300" />
        </div>
      ) : (
        <img
          src="/illustrations/empty-clients.png"
          alt=""
          aria-hidden
          width={200}
          height={200}
          draggable={false}
          className="h-36 w-auto select-none drop-shadow-[0_18px_36px_rgba(109,176,34,0.18)]"
        />
      )}
      <div className="space-y-1.5">
        <h3 className="text-lg font-medium tracking-tight">
          {hasQuery ? t('empty.noMatchTitle') : t('empty.noClientsTitle')}
        </h3>
        <p className="max-w-sm text-sm text-foreground/80 dark:text-foreground/65">
          {hasQuery ? t('empty.noMatchBody') : t('empty.noClientsBody')}
        </p>
      </div>
      {!hasQuery && (
        <button
          type="button"
          onClick={onInvite}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.02] cta-glow active:scale-[0.97]"
        >
          <Link2 className="h-4 w-4" />
          {t('actions.getJoinLink')}
        </button>
      )}
    </Glass>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

// ─── API → UI adapters ───────────────────────────────────────────────────
// The UI Client shape was designed around mock data. Compliance and programWeek
// now come from the active program assignment; trend is still a placeholder
// because nothing stores a previous period to compare against yet.

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
  // Map the API's raw status onto the UI's enum.
  //   'pending'  → awaiting the owner's approval (join-link signup)
  //   'inactive' → the owner declined them (only rejectJoinRequest writes this)
  // Anything unrecognised falls back to 'active' rather than inventing a state.
  const apiStatus = (row.status ?? 'active').toLowerCase();
  const uiStatus: ClientStatus =
    apiStatus === 'pending' ? 'pending_invite'
      : apiStatus === 'inactive' ? 'declined'
        : apiStatus === 'paused' || apiStatus === 'archived' || apiStatus === 'completed'
          ? 'paused'
          : 'active';
  // Prefer an assigned Program-Engine program (e.g. "100 Days Weight_Loss")
  // over the client's self-selected program_type; fall back to that, then to
  // '-' ("Awaiting onboarding") only when there's neither.
  const totalWeeks =
    row.assigned_program_weeks != null
      ? row.assigned_program_unit === 'days'
        ? Math.max(1, Math.ceil(row.assigned_program_weeks / 7))
        : row.assigned_program_weeks
      : 12;
  const week =
    row.assigned_program && row.assigned_program_start
      ? Math.min(
          totalWeeks,
          Math.max(1, Math.ceil((Date.now() - new Date(row.assigned_program_start).getTime()) / (7 * 86_400_000))),
        )
      : 0;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? '',
    status: uiStatus,
    program: row.assigned_program ?? (row.program_type ? humanizeProgram(row.program_type) : '-'),
    programWeek: week,
    programTotal: totalWeeks,
    // Task completion on the active assignment. A client with no assignment has
    // nothing to comply with, so they read 0 rather than being counted at risk.
    compliance: Math.max(0, Math.min(100, Math.round(Number(row.assigned_program_progress ?? 0)))),
    lastActivityAt: row.updated_at,
    joinedAt: row.created_at,
    trend: 'flat',
    goals: [],
    specialization: row.program_type ?? '',
    avatarUrl: row.avatar_url,
    lastActiveAt: row.last_active_at,
  };
}

/**
 * An imported email that hasn't signed up yet. Not a client row (they have no
 * auth user), so it gets a synthetic id — the roster shows them as pending so
 * the owner can see who they're still waiting on.
 */
function preapprovalToUiClient(pre: PreapprovalRow): Client {
  return {
    id: `preapproval:${pre.id}`,
    name: pre.name ?? pre.email.split('@')[0],
    email: pre.email,
    phone: pre.phone ?? '',
    status: 'pending_invite',
    program: '-',
    programWeek: 0,
    programTotal: 12,
    compliance: 0,
    lastActivityAt: pre.created_at,
    joinedAt: pre.created_at,
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
