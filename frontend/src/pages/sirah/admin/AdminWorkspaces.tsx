import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Search,
  Ban,
  Check,
  Trash2,
  Eye,
  LogIn,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  adminApi,
  type AdminWorkspaceListItem,
  type ListWorkspacesResult,
} from '@/modules/super-admin/api/admin';
import { switchApi } from '@/modules/workspace/api/tenancy';
import { supabase } from '@/integrations/supabase/client';

type StatusFilter = 'all' | 'active' | 'suspended' | 'deleted';
const PAGE_SIZE = 25;

export default function AdminWorkspaces() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  // Debounced search — kept simple, the input itself drives the query key.
  const debouncedQ = useDebounced(q, 300);

  const { data, isLoading, error } = useQuery<ListWorkspacesResult>({
    queryKey: ['admin', 'workspaces', { status, q: debouncedQ, offset }],
    queryFn: () =>
      adminApi.listWorkspaces({
        status: status === 'all' ? undefined : status,
        q: debouncedQ || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    placeholderData: (prev) => prev,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'workspaces'] });
    qc.invalidateQueries({ queryKey: ['admin', 'platform-stats'] });
  };

  const suspend = useMutation({
    mutationFn: (id: string) => adminApi.suspend(id),
    onSuccess: (_, id) => { toast.success(`Workspace suspended.`); invalidate(); void id; },
    onError: (err: ApiError) => toast.error(err.message),
  });
  const activate = useMutation({
    mutationFn: (id: string) => adminApi.activate(id),
    onSuccess: () => { toast.success(`Workspace activated.`); invalidate(); },
    onError: (err: ApiError) => toast.error(err.message),
  });
  const softDelete = useMutation({
    mutationFn: (id: string) => adminApi.softDelete(id),
    onSuccess: () => { toast.success(`Workspace soft-deleted.`); invalidate(); },
    onError: (err: ApiError) => toast.error(err.message),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8 md:py-12">
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="space-y-6"
      >
        {/* Header */}
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/60">
            Platform · Workspaces
          </span>
          <h1 className="text-balance mt-1">All workspaces</h1>
          <p className="text-pretty text-base text-foreground/80 dark:text-foreground/65 mt-2">
            Every nutritionist / clinic / coach tenant. Suspend, activate, or soft-delete.
            Soft-deleted workspaces stop signing in but their data is retained for audit.
          </p>
        </motion.div>

        {/* Filters */}
        <motion.div variants={fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'active', 'suspended', 'deleted'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setStatus(s); setOffset(0); }}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs capitalize transition-colors',
                  status === s
                    ? 'border-teal-400/60 bg-teal-400/10 text-teal-700 dark:text-teal-200'
                    : 'border-foreground/10 bg-foreground/[0.02] text-foreground/80 dark:text-foreground/65 hover:bg-foreground/[0.06]',
                )}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
            <input
              type="search"
              value={q}
              onChange={(e) => { setQ(e.target.value); setOffset(0); }}
              placeholder="Search name or owner email…"
              className="w-full rounded-lg border border-foreground/10 bg-foreground/[0.03] py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground/75 dark:text-foreground/60 focus:border-teal-400/60 focus:bg-foreground/[0.06] focus:outline-none"
            />
          </div>
        </motion.div>

        {/* Table / list */}
        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden">
            {error && (
              <div className="border-b border-rose-400/40 bg-rose-400/5 px-5 py-3 text-sm text-rose-700 dark:text-rose-200">
                {(error as Error).message}
              </div>
            )}

            <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
              <span>
                {isLoading
                  ? 'Loading…'
                  : total === 0
                    ? 'No workspaces'
                    : `Showing ${offset + 1}-${pageEnd} of ${total}`}
              </span>
              <span>updated · just now</span>
            </div>

            <ul className="divide-y divide-foreground/[0.04]">
              {items.length === 0 && !isLoading && (
                <li className="flex flex-col items-center gap-3 py-12 text-center">
                  <Building2 className="h-8 w-8 text-foreground/30" />
                  <div className="text-sm text-foreground/80 dark:text-foreground/65">
                    {q || status !== 'all'
                      ? 'No workspaces match these filters.'
                      : 'No workspaces yet. They appear here as nutritionists sign up.'}
                  </div>
                </li>
              )}

              {items.map((ws) => (
                <Row
                  key={ws.id}
                  ws={ws}
                  busy={suspend.isPending || activate.isPending || softDelete.isPending}
                  onSuspend={() => suspend.mutate(ws.id)}
                  onActivate={() => activate.mutate(ws.id)}
                  onDelete={() => {
                    if (confirm(`Soft-delete "${ws.name}"? They can no longer sign in. Data is preserved.`)) {
                      softDelete.mutate(ws.id);
                    }
                  }}
                />
              ))}
            </ul>

            {total > PAGE_SIZE && (
              <div className="flex items-center justify-end gap-2 border-t border-foreground/[0.06] px-5 py-3 text-xs text-foreground/80 dark:text-foreground/65">
                <button
                  type="button"
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  disabled={offset === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-foreground/10 px-2.5 py-1 hover:bg-foreground/[0.04] disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </button>
                <button
                  type="button"
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={pageEnd >= total}
                  className="inline-flex items-center gap-1 rounded-lg border border-foreground/10 px-2.5 py-1 hover:bg-foreground/[0.04] disabled:opacity-30"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </Glass>
        </motion.div>
      </motion.div>
    </div>
  );
}

function Row({
  ws,
  busy,
  onSuspend,
  onActivate,
  onDelete,
}: {
  ws: AdminWorkspaceListItem;
  busy: boolean;
  onSuspend: () => void;
  onActivate: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const trialEnd = new Date(ws.trial_ends_at);
  const trialEndsIn = Math.floor((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const isTrial = ws.plan === 'trial';
  const openDetail = () => navigate(`/admin/workspaces/${ws.id}`);

  const impersonate = async () => {
    try {
      await switchApi.impersonate(ws.id);
      toast.success(`Now viewing ${ws.name}`);
      await supabase.auth.refreshSession().catch(() => {});
      window.location.assign('/dashboard');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 hover:bg-foreground/[0.02] md:grid-cols-[2fr_1fr_1fr_auto]">
      {/* Name + slug + owner - click to open full details */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openDetail}
            className="truncate text-left text-sm font-medium text-foreground hover:text-teal-700 hover:underline dark:hover:text-teal-300"
            title="View full details"
          >
            {ws.name}
          </button>
          <StatusBadge status={ws.status} />
        </div>
        <div className="mt-0.5 truncate text-xs text-foreground/75 dark:text-foreground/55">
          {ws.owner_email ?? '(no owner email)'} · {ws.member_count} {ws.member_count === 1 ? 'member' : 'members'}
        </div>
      </div>

      {/* Plan + trial */}
      <div className="hidden flex-col items-start md:flex">
        <span className="rounded-full border border-foreground/10 bg-foreground/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-foreground/70">
          {ws.plan}
        </span>
        {isTrial && (
          <span className={cn(
            'mt-1 text-[10px] tabular-nums',
            trialEndsIn <= 7 ? 'text-amber-700 dark:text-amber-300' : 'text-foreground/75 dark:text-foreground/55',
          )}>
            trial {trialEndsIn >= 0 ? `${trialEndsIn}d left` : 'expired'}
          </span>
        )}
      </div>

      {/* Created */}
      <div className="hidden text-xs text-foreground/75 dark:text-foreground/55 md:block">
        {new Date(ws.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <ActionBtn label="View" icon={Eye} tone="default" onClick={openDetail} disabled={busy} />
        {ws.status !== 'deleted' && (
          <ActionBtn label="Impersonate" icon={LogIn} tone="default" onClick={() => void impersonate()} disabled={busy} />
        )}
        {ws.status === 'active' && (
          <ActionBtn label="Suspend" icon={Ban} tone="warn" onClick={onSuspend} disabled={busy} />
        )}
        {ws.status === 'suspended' && (
          <ActionBtn label="Activate" icon={Check} tone="ok" onClick={onActivate} disabled={busy} />
        )}
        {ws.status !== 'deleted' && (
          <ActionBtn label="Delete" icon={Trash2} tone="danger" onClick={onDelete} disabled={busy} />
        )}
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: AdminWorkspaceListItem['status'] }) {
  const tone =
    status === 'active'    ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200' :
    status === 'suspended' ? 'border-amber-300/40  bg-amber-300/10  text-amber-700 dark:text-amber-200' :
                             'border-rose-400/40   bg-rose-400/10   text-rose-700 dark:text-rose-200';
  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]', tone)}>
      {status}
    </span>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  tone,
  onClick,
  disabled,
}: {
  icon: typeof Ban;
  label: string;
  tone: 'ok' | 'warn' | 'danger' | 'default';
  onClick: () => void;
  disabled?: boolean;
}) {
  const cls = {
    ok:      'text-emerald-700 dark:text-emerald-300 hover:bg-emerald-400/10',
    warn:    'text-amber-700 dark:text-amber-300   hover:bg-amber-300/10',
    danger:  'text-rose-700 dark:text-rose-300    hover:bg-rose-400/10',
    default: 'text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn('inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs transition-colors disabled:opacity-50', cls)}
    >
      {disabled ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
