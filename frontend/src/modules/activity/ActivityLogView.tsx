import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  Filter, Loader2, RefreshCw, Search, User, Clock, Radio, RadioReceiver,
} from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import { useRealtime } from '@/lib/realtime';
import { StaffPushToggle } from './StaffPushToggle';
import {
  activityLogApi,
  type ActivityAction,
  type ActivityLogRow,
  type ActorRole,
} from '@/modules/workspace/api/activity-log';

/**
 * ActivityLogView — workspace activity feed.
 *
 * Live tail of mutations across the workspace. Rows expand to show the
 * payload + latency + IP / UA. Filters narrow by actor role, entity type,
 * action, or a free-text search on the route.
 */
interface ActivityLogViewProps {
  heroEyebrow: string;
}

const ACTOR_ROLE_LABEL: Record<ActorRole, string> = {
  super_admin:  'Super admin',
  owner:        'Owner',
  nutritionist: 'Nutritionist',
  client:       'Client',
  anonymous:    'Anonymous',
};

const ACTION_LABEL: Record<ActivityAction, string> = {
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  invoke: 'Invoke',
};

const ACTION_ACCENT: Record<ActivityAction, string> = {
  create: 'bg-emerald-500',
  update: 'bg-sky-500',
  delete: 'bg-rose-500',
  invoke: 'bg-teal-500',
};

export function ActivityLogView({ heroEyebrow }: ActivityLogViewProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState<ActivityAction | ''>('');
  const [liveCount, setLiveCount] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const feedQ = useQuery({
    queryKey: ['activity', 'workspace', search, entityType, action],
    queryFn: () => activityLogApi.listForWorkspace({
      limit: 100,
      search: search.trim() || undefined,
      entityType: entityType.trim() || undefined,
      action: action || undefined,
    }),
    retry: 1,
    staleTime: 0,
  });

  // Realtime — every server event prepends to the feed without polling.
  useRealtime<ActivityLogRow>('activity', (incoming) => {
    setLiveCount((c) => c + 1);
    queryClient.setQueryData<ActivityLogRow[] | undefined>(
      ['activity', 'workspace', search, entityType, action],
      (prev) => {
        if (!prev) return [incoming];
        // Skip if we filtered out this entity/action
        if (entityType && incoming.entity_type !== entityType) return prev;
        if (action && incoming.action !== action) return prev;
        // Dedupe by id (in case the GET race-arrived first)
        if (prev.some((r) => r.id === incoming.id)) return prev;
        return [incoming, ...prev].slice(0, 200);
      },
    );
  });

  const rows = feedQ.data ?? [];

  return (
    <motion.div
      variants={stagger(0.06, 0.05)}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[11px] uppercase tracking-[0.22em] text-foreground/45">
            {heroEyebrow}
          </span>
          <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">Activity</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/60">
            Every write across this workspace is recorded automatically by the application-flow interceptor.
            Use it to trace who changed what, when, and from where.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StaffPushToggle />
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-1.5 text-xs text-emerald-400"
            title="Streamed live via WebSocket"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live
            {liveCount > 0 && (
              <span className="ml-1 tabular-nums text-emerald-400/85">· {liveCount}</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => void feedQ.refetch()}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs text-foreground/75 transition-colors hover:border-foreground/15 hover:bg-foreground/[0.03]"
          >
            <RefreshCw className={cn('h-3 w-3', feedQ.isFetching && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div variants={fadeUp} className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search route…  e.g.  recipes  /  clients  /  invites"
            className="w-full rounded-xl border border-foreground/[0.08] bg-transparent px-10 py-2.5 text-sm placeholder:text-foreground/35 focus:border-teal-500/40 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-3 w-3 text-foreground/40" />
          <FilterChip
            label="Entity"
            value={entityType || 'All'}
            options={[
              'All', 'client', 'invite', 'recipe', 'food', 'meal_log',
              'program', 'appointment', 'workspace', 'measurement',
            ]}
            onPick={(v) => setEntityType(v === 'All' ? '' : v)}
          />
          <FilterChip
            label="Action"
            value={action ? ACTION_LABEL[action] : 'All'}
            options={['All', 'Create', 'Update', 'Delete', 'Invoke']}
            onPick={(v) => setAction(v === 'All' ? '' : (v.toLowerCase() as ActivityAction))}
          />
          <span className="ml-auto text-[11px] tabular-nums text-foreground/40">
            {rows.length.toLocaleString()} {rows.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </motion.div>

      {/* Feed */}
      <motion.div variants={fadeUp}>
        {feedQ.isLoading ? (
          <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </Glass>
        ) : rows.length === 0 ? (
          <Glass className="flex flex-col items-center gap-2 p-10 text-center">
            <Activity className="h-6 w-6 text-foreground/30" />
            <div className="text-sm text-foreground/55">No activity recorded yet.</div>
          </Glass>
        ) : (
          <Glass className="overflow-hidden">
            <ul className="divide-y divide-foreground/[0.05]">
              {rows.map((row) => (
                <ActivityRow
                  key={row.id}
                  row={row}
                  expanded={expanded === row.id}
                  onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
                />
              ))}
            </ul>
          </Glass>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────

export function ActivityRow({
  row, expanded, onToggle, workspaceLabel,
}: {
  row: ActivityLogRow;
  expanded: boolean;
  onToggle: () => void;
  /** Optional workspace name chip — used by the org-wide audit feed that
   *  spans multiple workspaces. Omitted in the single-workspace feed. */
  workspaceLabel?: string;
}) {
  const isFailure = row.status_code >= 400;
  const actor = row.actor_role ?? 'anonymous';
  const actionAccent = ACTION_ACCENT[row.action];

  return (
    <li
      className={cn(
        'transition-colors',
        isFailure ? 'bg-rose-500/[0.025]' : 'hover:bg-foreground/[0.02]',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        {/* Action accent stripe */}
        <span className="mt-1.5 flex flex-col items-center">
          <span className={cn('h-2 w-2 rounded-full', actionAccent)} />
        </span>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-foreground/55">
              {ACTION_LABEL[row.action]}
            </span>
            {row.entity_type && (
              <span className="text-sm font-medium text-foreground">{row.entity_type}</span>
            )}
            {row.entity_id && (
              <span className="font-mono text-[11px] tabular-nums text-foreground/50">
                {row.entity_id.slice(0, 8)}…
              </span>
            )}
            {isFailure ? (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-rose-500">
                <AlertTriangle className="h-3 w-3" /> {row.status_code}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-emerald-500/85">
                <CheckCircle2 className="h-3 w-3" /> {row.status_code}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-foreground/55">
            {workspaceLabel && (
              <>
                <span className="inline-flex items-center gap-1 rounded-full border border-foreground/[0.08] px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-foreground/60">
                  {workspaceLabel}
                </span>
                <span>·</span>
              </>
            )}
            <span className="font-mono text-foreground/65">
              {row.http_method} {row.route}
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3 text-foreground/35" />
              {/* Who did it: name (or email) first, with the role as a quiet
                  qualifier. Falls back to just the role for system writes with
                  no resolvable actor. */}
              {row.actor_name || row.actor_email ? (
                <>
                  <span className="text-foreground/75">{row.actor_name ?? row.actor_email}</span>
                  <span className="text-foreground/40">· {ACTOR_ROLE_LABEL[actor as ActorRole] ?? actor}</span>
                </>
              ) : (
                ACTOR_ROLE_LABEL[actor as ActorRole] ?? actor
              )}
            </span>
            {row.latency_ms != null && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock className="h-3 w-3 text-foreground/35" />
                  {row.latency_ms}ms
                </span>
              </>
            )}
            <span>·</span>
            <time className="tabular-nums" dateTime={row.created_at} title={row.created_at}>
              {formatRelative(row.created_at)}
            </time>
          </div>
        </div>

        {/* Expand indicator */}
        <span className="text-foreground/35">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-foreground/[0.04] bg-foreground/[0.015] px-4 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DetailField label="Request ID" value={row.request_id} mono />
            <DetailField label="IP" value={row.ip} mono />
            <DetailField label="Actor user ID" value={row.actor_user_id} mono />
            <DetailField label="User agent" value={row.user_agent} clamp />
          </div>
          {row.error_message && (
            <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.04] p-2.5 text-xs text-rose-400/85">
              {row.error_message}
            </div>
          )}
          {row.payload != null && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
                Payload
              </div>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-foreground/[0.04] p-2.5 text-[11px] leading-relaxed text-foreground/80">
                {JSON.stringify(row.payload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function DetailField({
  label, value, mono, clamp,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  clamp?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</div>
      <div
        className={cn(
          'mt-0.5 text-xs text-foreground/80',
          mono && 'font-mono',
          clamp && 'truncate',
        )}
      >
        {value ?? <span className="text-foreground/35">-</span>}
      </div>
    </div>
  );
}

// ─── Filter chip ─────────────────────────────────────────────────────

function FilterChip({
  label, value, options, onPick,
}: {
  label: string;
  value: string;
  options: string[];
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.08] px-3 py-1 text-xs',
          'text-foreground/85 transition-colors hover:border-foreground/15 hover:bg-foreground/[0.03]',
        )}
      >
        <span className="text-foreground/45">{label}:</span>
        <span>{value}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1.5 max-h-72 w-56 overflow-y-auto rounded-xl border border-foreground/[0.08] bg-popover p-1 shadow-2xl">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => { onPick(opt); setOpen(false); }}
                className={cn(
                  'w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors',
                  value === opt ? 'bg-foreground/[0.06] text-foreground' : 'text-foreground/75 hover:bg-foreground/[0.04]',
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Relative time ──────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString();
}
