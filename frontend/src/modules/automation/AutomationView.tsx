import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight,
  Clock, Loader2, Plus, Power, Trash2, Zap, ZapOff,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import {
  automationApi,
  TRIGGER_EVENTS,
  type AutomationRule,
  type AutomationRun,
} from '@/modules/workspace/api/automation';
import { RuleEditor } from './RuleEditor';

/**
 * AutomationView — Rules + Run log in a single page.
 *
 * Two columns on desktop:
 *   - Left:  rule list  (click to edit, toggle to enable/disable)
 *   - Right: run log    (latest 50 firings across all rules in this workspace)
 *
 * "New rule" opens the RuleEditor in a sheet. Saving refetches both panes.
 */
export function AutomationView({ heroEyebrow }: { heroEyebrow: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AutomationRule | 'new' | null>(null);

  const rulesQ = useQuery({
    queryKey: ['automation', 'rules'],
    queryFn: automationApi.listRules,
    retry: 1,
    staleTime: 15_000,
  });

  const runsQ = useQuery({
    queryKey: ['automation', 'runs'],
    queryFn: () => automationApi.listRuns({ limit: 50 }),
    retry: 1,
    refetchInterval: 5_000,
    staleTime: 0,
  });

  const analyticsQ = useQuery({
    queryKey: ['automation', 'analytics'],
    queryFn: automationApi.analytics,
    retry: 1,
    staleTime: 30_000,
  });

  const toggleMut = useMutation({
    mutationFn: (rule: AutomationRule) =>
      automationApi.updateRule(rule.id, { is_enabled: !rule.is_enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['automation', 'rules'] });
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => automationApi.removeRule(id),
    onSuccess: () => {
      toast.success('Rule deleted');
      void queryClient.invalidateQueries({ queryKey: ['automation'] });
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  const rules = rulesQ.data ?? [];
  const runs = runsQ.data ?? [];

  return (
    <motion.div
      variants={stagger(0.06, 0.05)}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[11px] uppercase tracking-[0.22em] text-foreground/45">
            {heroEyebrow}
          </span>
          <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">Automation</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/60">
            Rules fire when matching activity happens in your workspace. Connect events to
            in-app notifications or outbound webhooks. Every firing is logged on the right.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-1.5 rounded-full bg-violet-500 px-4 py-2 text-xs font-medium text-white hover:bg-violet-600"
        >
          <Plus className="h-3.5 w-3.5" />
          New rule
        </button>
      </motion.div>

      {/* Analytics strip */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Rules" value={`${analyticsQ.data?.enabled_rules ?? 0}/${analyticsQ.data?.total_rules ?? 0}`} hint="enabled / total" />
        <StatTile label="Total fires" value={String(analyticsQ.data?.total_fires ?? 0)} hint="all time" />
        <StatTile label="Runs (7d)" value={String(analyticsQ.data?.runs_7d ?? 0)} hint="last 7 days" />
        <StatTile label="Success rate" value={`${analyticsQ.data?.success_rate ?? 100}%`} hint="last 30 days" />
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,420px]">
        {/* Rules */}
        <motion.div variants={fadeUp}>
          {rulesQ.isLoading ? (
            <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </Glass>
          ) : rules.length === 0 ? (
            <Glass className="flex flex-col items-center gap-3 p-12 text-center">
              <Zap className="h-7 w-7 text-foreground/30" />
              <div className="text-sm text-foreground/65">No automation rules yet.</div>
              <button
                type="button"
                onClick={() => setEditing('new')}
                className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-violet-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-600"
              >
                <Plus className="h-3.5 w-3.5" />
                Create your first rule
              </button>
            </Glass>
          ) : (
            <Glass className="overflow-hidden">
              <ul className="divide-y divide-foreground/[0.05]">
                {rules.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    onEdit={() => setEditing(rule)}
                    onToggle={() => toggleMut.mutate(rule)}
                    onDelete={() => {
                      if (confirm(`Delete rule "${rule.name}"?`)) deleteMut.mutate(rule.id);
                    }}
                  />
                ))}
              </ul>
            </Glass>
          )}
        </motion.div>

        {/* Runs */}
        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-foreground/[0.06] px-4 py-3">
              <h2 className="text-sm font-medium">Recent runs</h2>
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-foreground/55">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
                Live
              </span>
            </div>
            {runsQ.isLoading ? (
              <div className="flex items-center justify-center p-8 text-xs text-foreground/55">
                <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Loading…
              </div>
            ) : runs.length === 0 ? (
              <div className="p-8 text-center text-xs text-foreground/45">
                No runs yet — once a rule fires, you'll see entries here.
              </div>
            ) : (
              <ul className="max-h-[640px] divide-y divide-foreground/[0.04] overflow-y-auto">
                {runs.map((r) => (
                  <RunRow key={r.id} run={r} />
                ))}
              </ul>
            )}
          </Glass>
        </motion.div>
      </div>

      {editing && (
        <RuleEditor
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: ['automation'] });
          }}
        />
      )}
    </motion.div>
  );
}

// ─── Rule row ────────────────────────────────────────────────────────

function RuleRow({
  rule, onEdit, onToggle, onDelete,
}: {
  rule: AutomationRule;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const triggerLabel = TRIGGER_EVENTS.find((t) => t.value === rule.trigger_event)?.label ?? rule.trigger_event;
  return (
    <li className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        title={rule.is_enabled ? 'Disable rule' : 'Enable rule'}
        className={cn(
          'mt-1 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full transition-colors',
          rule.is_enabled
            ? 'bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25'
            : 'bg-foreground/[0.07] text-foreground/40 hover:bg-foreground/[0.12]',
        )}
      >
        {rule.is_enabled ? <Power className="h-3 w-3" /> : <ZapOff className="h-3 w-3" />}
      </button>

      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{rule.name}</span>
          {!rule.is_enabled && (
            <span className="text-[10px] uppercase tracking-[0.14em] text-foreground/40">Off</span>
          )}
          {rule.last_error && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-rose-500">
              <AlertTriangle className="h-3 w-3" /> Error
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-foreground/55">
          <span className="font-mono">{triggerLabel}</span>
          <ArrowRight className="h-3 w-3" />
          <span>
            {rule.actions.length} action{rule.actions.length === 1 ? '' : 's'}
          </span>
          {rule.conditions.length > 0 && (
            <>
              <span>·</span>
              <span>
                {rule.conditions.length} condition{rule.conditions.length === 1 ? '' : 's'}
              </span>
            </>
          )}
          <span>·</span>
          <span className="tabular-nums">
            fired {rule.fire_count.toLocaleString()}×
          </span>
          {rule.last_fired_at && (
            <>
              <span>·</span>
              <span>last {formatRelative(rule.last_fired_at)}</span>
            </>
          )}
        </div>
      </button>

      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete rule"
        className="rounded-lg p-1.5 text-foreground/35 opacity-0 transition-all hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

// ─── Run row ────────────────────────────────────────────────────────

function RunRow({ run }: { run: AutomationRun }) {
  const [open, setOpen] = useState(false);
  const statusIcon =
    run.status === 'success' ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> :
    run.status === 'failed'  ? <AlertTriangle className="h-3 w-3 text-rose-500" /> :
    <Clock className="h-3 w-3 text-foreground/40" />;

  return (
    <li className={cn(
      'text-xs',
      run.status === 'failed' && 'bg-rose-500/[0.025]',
    )}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-foreground/[0.02]"
      >
        <span className="mt-0.5">{statusIcon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">{run.rule_name ?? run.rule_id.slice(0, 8)}</span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-foreground/45">
              {run.status}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-foreground/50">
            <span className="font-mono">{run.trigger_event}</span>
            {run.latency_ms != null && <span>· {run.latency_ms}ms</span>}
            <span>· {formatRelative(run.started_at)}</span>
          </div>
        </div>
        {open ? <ChevronDown className="h-3 w-3 text-foreground/35" /> : <ChevronRight className="h-3 w-3 text-foreground/35" />}
      </button>
      {open && (
        <div className="border-t border-foreground/[0.04] bg-foreground/[0.015] px-4 py-3">
          {run.error_message && (
            <div className="mb-2 rounded-md border border-rose-500/30 bg-rose-500/[0.04] p-2 text-[11px] text-rose-400">
              {run.error_message}
            </div>
          )}
          {run.action_results.length > 0 && (
            <div className="space-y-1">
              {run.action_results.map((a, i) => (
                <div key={i} className="flex items-baseline gap-2 text-[11px]">
                  <span className={cn(
                    'inline-block h-1.5 w-1.5 rounded-full flex-shrink-0',
                    a.status === 'success' ? 'bg-emerald-500' :
                    a.status === 'failed'  ? 'bg-rose-500' : 'bg-foreground/30',
                  )} />
                  <span className="font-mono text-foreground/65">{a.type}</span>
                  {a.detail && <span className="text-foreground/55">— {a.detail}</span>}
                  {a.latency_ms != null && (
                    <span className="ml-auto text-foreground/40 tabular-nums">{a.latency_ms}ms</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function StatTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Glass className="p-3.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/50">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-foreground/45">{hint}</div>
    </Glass>
  );
}
