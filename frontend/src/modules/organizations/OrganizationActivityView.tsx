import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Activity, Building2, ChevronDown, Filter, Loader2, RefreshCw, Search,
} from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import { ActivityRow } from '@/modules/activity/ActivityLogView';
import { organizationsApi } from '@/modules/workspace/api/organizations';
import type { ActivityAction } from '@/modules/workspace/api/activity-log';

/**
 * OrganizationActivityView — org-wide audit trail.
 *
 * Unlike the workspace feed (single workspace, live WebSocket tail), this view
 * spans EVERY workspace in the organization. Each row carries a workspace chip
 * so an org owner/admin can trace activity across their whole network and drill
 * into one workspace via the filter.
 *
 * Any active org member (incl. org_viewer) may read it; the backend asserts
 * membership and scopes by organization_id.
 */
const ACTION_LABEL: Record<ActivityAction, string> = {
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  invoke: 'Invoke',
};

export function OrganizationActivityView({ heroEyebrow }: { heroEyebrow: string }) {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState('');
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState<ActivityAction | ''>('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const orgsQ = useQuery({
    queryKey: ['orgs', 'list'],
    queryFn: organizationsApi.list,
    retry: 1,
  });

  const orgs = orgsQ.data ?? [];
  const org = selectedOrgId ? orgs.find((o) => o.id === selectedOrgId) : orgs[0];

  const wsQ = useQuery({
    queryKey: ['orgs', org?.id, 'workspaces'],
    queryFn: () => organizationsApi.listWorkspaces(org!.id),
    enabled: !!org,
    retry: 1,
  });

  const workspaces = wsQ.data ?? [];
  const wsNameById = useMemo(
    () => new Map(workspaces.map((w) => [w.id, w.name])),
    [workspaces],
  );

  const feedQ = useQuery({
    queryKey: ['orgs', org?.id, 'activity', workspaceId, search, entityType, action],
    queryFn: () => organizationsApi.listActivity(org!.id, {
      limit: 100,
      workspaceId: workspaceId || undefined,
      search: search.trim() || undefined,
      entityType: entityType.trim() || undefined,
      action: action || undefined,
    }),
    enabled: !!org,
    retry: 1,
    staleTime: 0,
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
          <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">Organization audit</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/60">
            Every write across all workspaces in the organization, newest first. Use it to trace
            who changed what, in which workspace, and from where.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void feedQ.refetch()}
          disabled={!org}
          className="inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs text-foreground/75 transition-colors hover:border-foreground/15 hover:bg-foreground/[0.03] disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3 w-3', feedQ.isFetching && 'animate-spin')} />
          Refresh
        </button>
      </motion.div>

      {orgsQ.isLoading ? (
        <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </Glass>
      ) : orgs.length === 0 ? (
        <Glass className="flex flex-col items-center gap-2 p-12 text-center">
          <Building2 className="h-7 w-7 text-foreground/30" />
          <div className="text-sm text-foreground/60">
            You are not part of any organization yet.
          </div>
        </Glass>
      ) : (
        <>
          {/* Org + workspace selectors */}
          <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-2">
            <Picker
              icon={<Building2 className="h-3 w-3" />}
              label="Org"
              value={org?.name ?? '—'}
              options={orgs.map((o) => ({ value: o.id, label: o.name }))}
              onPick={(v) => { setSelectedOrgId(v); setWorkspaceId(''); }}
            />
            <Picker
              label="Workspace"
              value={workspaceId ? (wsNameById.get(workspaceId) ?? 'Unknown') : 'All'}
              options={[
                { value: '', label: 'All workspaces' },
                ...workspaces.map((w) => ({ value: w.id, label: w.name })),
              ]}
              onPick={setWorkspaceId}
            />
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
                className="w-full rounded-xl border border-foreground/[0.08] bg-transparent px-10 py-2.5 text-sm placeholder:text-foreground/35 focus:border-violet-500/40 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-3 w-3 text-foreground/40" />
              <Picker
                label="Entity"
                value={entityType || 'All'}
                options={[
                  'All', 'client', 'invite', 'recipe', 'food', 'meal_log',
                  'program', 'appointment', 'workspace', 'measurement',
                ].map((v) => ({ value: v === 'All' ? '' : v, label: v }))}
                onPick={setEntityType}
              />
              <Picker
                label="Action"
                value={action ? ACTION_LABEL[action] : 'All'}
                options={[
                  { value: '', label: 'All' },
                  { value: 'create', label: 'Create' },
                  { value: 'update', label: 'Update' },
                  { value: 'delete', label: 'Delete' },
                  { value: 'invoke', label: 'Invoke' },
                ]}
                onPick={(v) => setAction(v as ActivityAction | '')}
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
                      workspaceLabel={
                        row.workspace_id
                          ? (wsNameById.get(row.workspace_id) ?? 'workspace')
                          : 'platform'
                      }
                      expanded={expanded === row.id}
                      onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
                    />
                  ))}
                </ul>
              </Glass>
            )}
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

// ─── Picker ──────────────────────────────────────────────────────────

function Picker({
  icon, label, value, options, onPick,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
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
        {icon}
        <span className="text-foreground/45">{label}:</span>
        <span className="max-w-[140px] truncate">{value}</span>
        <ChevronDown className="h-3 w-3 text-foreground/40" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1.5 max-h-72 w-60 overflow-y-auto rounded-xl border border-foreground/[0.08] bg-popover p-1 shadow-2xl">
            {options.map((opt) => (
              <button
                key={opt.value || '__all'}
                type="button"
                onClick={() => { onPick(opt.value); setOpen(false); }}
                className={cn(
                  'w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors',
                  value === opt.label
                    ? 'bg-foreground/[0.06] text-foreground'
                    : 'text-foreground/75 hover:bg-foreground/[0.04]',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
