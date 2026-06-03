import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileDown,
  Hourglass,
  Plus,
  Shield,
} from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import {
  adminApi,
  type ComplianceSnapshot,
  type DeletionRequestRow,
  type DeletionStatus,
  type ListDeletionRequestsResult,
} from '@/modules/super-admin/api/admin';
import { cn } from '@/lib/utils';

const DATE = new Intl.DateTimeFormat('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

const STATUS_TABS: { key: DeletionStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in_review', label: 'In review' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
];

export default function AdminCompliance() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<DeletionStatus | 'all'>('all');
  const [page, setPage] = useState(0);
  const [openForm, setOpenForm] = useState(false);
  const [dsarUserId, setDsarUserId] = useState('');
  const limit = 25;

  const snapshotQ = useQuery<ComplianceSnapshot>({
    queryKey: ['admin', 'compliance', 'snapshot'],
    queryFn: () => adminApi.complianceSnapshot(),
    staleTime: 30_000,
  });

  const listQ = useQuery<ListDeletionRequestsResult>({
    queryKey: ['admin', 'compliance', 'requests', tab, page],
    queryFn: () => adminApi.listDeletionRequests({
      status: tab === 'all' ? undefined : tab,
      limit, offset: page * limit,
    }),
    keepPreviousData: true,
    staleTime: 30_000,
  });

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; status: DeletionStatus; notes?: string }) =>
      adminApi.updateDeletionRequest(vars.id, { status: vars.status, notes: vars.notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'compliance'] });
      toast.success('Status updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = snapshotQ.data;
  const total = listQ.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8 md:py-12">
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-8">
        <motion.div variants={fadeUp} className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/60">
            Compliance
          </span>
          <h1 className="text-balance">DPDP / GDPR — erasure queue + DSAR exports.</h1>
          <p className="text-pretty text-base text-foreground/80 dark:text-foreground/65 md:text-lg md:leading-relaxed">
            7-day SLA on deletion requests. DSAR exports compile every row across the platform for a given user.
          </p>
        </motion.div>

        {/* KPIs */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi icon={Clock}          label="Pending"     value={s?.pending_count ?? '—'}    loading={snapshotQ.isLoading} tone="warn" />
          <Kpi icon={Hourglass}      label="In review"   value={s?.in_review_count ?? '—'}  loading={snapshotQ.isLoading} />
          <Kpi icon={CheckCircle2}   label="Completed"   value={s?.completed_count ?? '—'}  loading={snapshotQ.isLoading} tone="ok" />
          <Kpi icon={AlertTriangle}  label="Overdue (>7d)" value={s?.overdue_count ?? '—'}  loading={snapshotQ.isLoading}
            tone={s && s.overdue_count > 0 ? 'danger' : 'neutral'} />
        </motion.div>

        {/* DSAR export tool */}
        <motion.div variants={fadeUp}>
          <Glass className="p-6">
            <div className="flex items-start gap-3">
              <FileDown className="mt-0.5 h-5 w-5 text-violet-700 dark:text-violet-300" />
              <div className="flex-1">
                <h2 className="text-base font-semibold">DSAR — Data Subject Access Request</h2>
                <p className="mt-1 text-sm text-foreground/65">
                  Enter a user UUID. Backend compiles every row from <code>workspace_members</code>,{' '}
                  <code>user_roles</code>, <code>ai_usage_events</code>, <code>admin_audit_log</code> + auth metadata into a JSON download.
                </p>
                <div className="mt-3 flex gap-2">
                  <input
                    value={dsarUserId}
                    onChange={(e) => setDsarUserId(e.target.value)}
                    placeholder="user-uuid-here…"
                    className="flex-1 rounded-lg border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2 text-sm placeholder:text-foreground/40 focus:border-violet-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!dsarUserId.trim()}
                    onClick={() => downloadDsar(dsarUserId.trim())}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02] disabled:opacity-40"
                  >
                    <Download className="h-4 w-4" />
                    Export JSON
                  </button>
                </div>
              </div>
            </div>
          </Glass>
        </motion.div>

        {/* Status tabs + new */}
        <motion.div variants={fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => { setTab(t.key); setPage(0); }}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  tab === t.key
                    ? 'bg-gradient-to-r from-blue-600 to-fuchsia-500 text-white'
                    : 'border border-foreground/[0.08] bg-foreground/[0.03] text-foreground/70 hover:bg-foreground/[0.06]',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOpenForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-3 py-1.5 text-xs font-medium hover:bg-foreground/[0.10]"
          >
            <Plus className="h-3.5 w-3.5" />
            New request
          </button>
        </motion.div>

        {openForm && <NewRequestForm onClose={() => setOpenForm(false)} />}

        {/* Table */}
        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-foreground/[0.06] bg-foreground/[0.02] text-left text-[11px] uppercase tracking-[0.14em] text-foreground/55">
                  <tr>
                    <th className="px-5 py-3">Target user</th>
                    <th className="px-5 py-3">Workspace</th>
                    <th className="px-5 py-3">Channel</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Due by</th>
                    <th className="px-5 py-3">Filed</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {listQ.isLoading && (
                    <tr><td colSpan={7} className="px-5 py-8 text-center text-foreground/55">Loading…</td></tr>
                  )}
                  {!listQ.isLoading && (listQ.data?.items.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center">
                        <div className="mx-auto max-w-md text-sm text-foreground/65">
                          <Shield className="mx-auto mb-3 h-8 w-8 text-foreground/30" />
                          <p className="font-medium text-foreground/80">No deletion requests in this view.</p>
                          <p className="mt-1">File one above, or wait for self-serve requests to land here.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                  {(listQ.data?.items ?? []).map((r) => (
                    <DeletionRow
                      key={r.id}
                      row={r}
                      onChangeStatus={(status) => updateMut.mutate({ id: r.id, status })}
                      busy={updateMut.isPending}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {total > 0 && (
              <div className="flex items-center justify-between border-t border-foreground/[0.06] px-5 py-3 text-xs text-foreground/65">
                <span>{total} total · page {page + 1} of {pages}</span>
                <div className="flex gap-1">
                  <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="rounded-lg border border-foreground/[0.08] px-2.5 py-1 hover:bg-foreground/[0.04] disabled:opacity-30">Prev</button>
                  <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-foreground/[0.08] px-2.5 py-1 hover:bg-foreground/[0.04] disabled:opacity-30">Next</button>
                </div>
              </div>
            )}
          </Glass>
        </motion.div>

        {s?.avg_resolution_days != null && (
          <motion.div variants={fadeUp}>
            <Glass className="p-5 text-sm text-foreground/75">
              Average resolution time (last 30 days): <strong className="text-foreground">{s.avg_resolution_days} days</strong>.
            </Glass>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

function NewRequestForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [channel, setChannel] = useState<'support' | 'self' | 'admin'>('support');

  const m = useMutation({
    mutationFn: () => adminApi.createDeletionRequest({ targetEmail: email, channel, reason: reason || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'compliance'] });
      toast.success('Deletion request filed');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    m.mutate();
  }

  return (
    <motion.div variants={fadeUp}>
      <Glass className="p-5">
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            type="email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Target user email"
            className="rounded-lg border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
          />
          <select
            value={channel} onChange={(e) => setChannel(e.target.value as 'support' | 'self' | 'admin')}
            className="rounded-lg border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
          >
            <option value="support">Support ticket</option>
            <option value="self">Self-serve</option>
            <option value="admin">Filed by admin</option>
          </select>
          <input
            value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="rounded-lg border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2 text-sm placeholder:text-foreground/40 focus:border-violet-400 focus:outline-none"
          />
          <div className="md:col-span-3 flex gap-2">
            <button type="submit" disabled={m.isPending}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
              {m.isPending ? 'Filing…' : 'File request'}
            </button>
            <button type="button" onClick={onClose}
              className="rounded-lg border border-foreground/[0.08] px-4 py-2 text-sm hover:bg-foreground/[0.04]">
              Cancel
            </button>
          </div>
        </form>
      </Glass>
    </motion.div>
  );
}

function DeletionRow({ row, onChangeStatus, busy }: {
  row: DeletionRequestRow;
  onChangeStatus: (s: DeletionStatus) => void;
  busy: boolean;
}) {
  const overdue = row.status !== 'completed' && row.status !== 'rejected' && new Date(row.due_by).getTime() < Date.now();
  return (
    <tr className="border-b border-foreground/[0.04] last:border-0">
      <td className="px-5 py-3">
        <div className="font-medium text-foreground">{row.target_email}</div>
        <div className="text-[11px] text-foreground/55">{row.requested_by_email ?? 'system'}</div>
      </td>
      <td className="px-5 py-3 text-foreground/85">{row.workspace_name ?? '—'}</td>
      <td className="px-5 py-3 text-foreground/75 capitalize">{row.request_channel}</td>
      <td className="px-5 py-3"><StatusPill status={row.status} /></td>
      <td className={cn('px-5 py-3', overdue ? 'text-rose-700 dark:text-rose-300' : 'text-foreground/75')}>
        {DATE.format(new Date(row.due_by))}{overdue && ' ⚠'}
      </td>
      <td className="px-5 py-3 text-foreground/75">{DATE.format(new Date(row.created_at))}</td>
      <td className="px-5 py-3">
        {(row.status === 'pending' || row.status === 'in_review') && (
          <div className="flex flex-wrap gap-1">
            {row.status === 'pending' && (
              <button disabled={busy} onClick={() => onChangeStatus('in_review')}
                className="rounded-full border border-foreground/[0.08] px-2 py-0.5 text-[11px] hover:bg-foreground/[0.04]">
                Start review
              </button>
            )}
            <button disabled={busy} onClick={() => onChangeStatus('completed')}
              className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-400/15 dark:text-emerald-200">
              Complete
            </button>
            <button disabled={busy} onClick={() => onChangeStatus('rejected')}
              className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[11px] text-rose-700 hover:bg-rose-400/15 dark:text-rose-200">
              Reject
            </button>
          </div>
        )}
        {(row.status === 'completed' || row.status === 'rejected') && (
          <span className="text-[11px] text-foreground/55">
            {row.processed_at ? DATE.format(new Date(row.processed_at)) : '—'}
          </span>
        )}
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: DeletionStatus }) {
  const map: Record<DeletionStatus, string> = {
    pending:    'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200',
    in_review:  'border-sky-400/40 bg-sky-400/10 text-sky-700 dark:text-sky-200',
    completed:  'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200',
    rejected:   'border-foreground/15 bg-foreground/[0.06] text-foreground/70',
  };
  return (
    <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]', map[status])}>
      {status.replace('_', ' ')}
    </span>
  );
}

function Kpi({ icon: Icon, label, value, loading, tone = 'neutral' }: {
  icon: typeof Clock; label: string; value: number | string; loading: boolean;
  tone?: 'neutral' | 'ok' | 'warn' | 'danger';
}) {
  const color = {
    neutral: 'text-violet-700 dark:text-violet-300',
    ok:      'text-emerald-700 dark:text-emerald-300',
    warn:    'text-amber-700 dark:text-amber-300',
    danger:  'text-rose-700 dark:text-rose-300',
  }[tone];
  return (
    <Glass className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">
        {loading ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-foreground/[0.06]" /> : value}
      </div>
    </Glass>
  );
}

async function downloadDsar(userId: string) {
  try {
    const res = await adminApi.dsarExport(userId);
    const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dsar-${userId}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('DSAR export ready');
  } catch (e) {
    toast.error((e as Error).message);
  }
}