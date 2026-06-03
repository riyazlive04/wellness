import { Pencil, Trash2, Play, Pause, History } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import type { Workflow, WorkflowStatus } from '../types';
import { FlowChain } from './FlowNode';

const STATUS_META: Record<WorkflowStatus, { label: string; chip: string; dot: string }> = {
  active: { label: 'Active', chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200', dot: 'bg-emerald-400' },
  paused: { label: 'Paused', chip: 'border-amber-300/40 bg-amber-300/10 text-amber-700 dark:text-amber-200',       dot: 'bg-amber-300' },
  draft:  { label: 'Draft',  chip: 'border-foreground/15 bg-foreground/[0.04] text-foreground/75 dark:text-foreground/55',             dot: 'bg-foreground/40' },
};

interface WorkflowCardProps {
  workflow: Workflow;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}

export function WorkflowCard({ workflow, onToggle, onEdit, onRemove }: WorkflowCardProps) {
  const status = STATUS_META[workflow.status];
  const isActive = workflow.status === 'active';
  const isDraft = workflow.status === 'draft';

  return (
    <Glass className={cn('overflow-hidden', !isActive && 'opacity-90')}>
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-foreground/[0.06] px-5 py-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-medium text-foreground">{workflow.name}</h3>
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em]', status.chip)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />
              {status.label}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-foreground/75 dark:text-foreground/55">{workflow.description}</p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onToggle(workflow.id)}
            disabled={isDraft}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/85 transition-colors hover:bg-foreground/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
            title={isDraft ? 'Finish the draft first' : isActive ? 'Pause' : 'Resume'}
          >
            {isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {isActive ? 'Pause' : isDraft ? 'Activate' : 'Resume'}
          </button>
          <button
            type="button"
            onClick={() => onEdit(workflow.id)}
            className="grid h-8 w-8 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 hover:bg-foreground/[0.05] hover:text-foreground"
            aria-label="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(workflow.id)}
            className="grid h-8 w-8 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 hover:bg-rose-500/[0.1] hover:text-rose-700 dark:text-rose-300"
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Flow visualization */}
      <div className="overflow-x-auto px-5 py-4">
        <FlowChain nodes={workflow.nodes} />
      </div>

      {/* Stats footer */}
      {!isDraft && (
        <div className="grid grid-cols-2 gap-4 border-t border-foreground/[0.04] px-5 py-3 text-xs sm:grid-cols-4">
          <Stat label="Runs this month" value={String(workflow.runsThisMonth)} />
          <Stat label="Success rate"    value={`${workflow.successRate}%`} tone="emerald" />
          <Stat label="Last run"        value={workflow.lastRunAt ? relativeTime(workflow.lastRunAt) : '—'} />
          <Stat label="Time saved"      value={`${workflow.timeSavedHours.toFixed(1)}h`} tone="indigo" />
        </div>
      )}

      {isDraft && (
        <div className="flex items-center justify-between border-t border-foreground/[0.04] px-5 py-3 text-xs">
          <span className="text-foreground/75 dark:text-foreground/60">Not running yet — review the flow and hit Activate when ready.</span>
          <button
            type="button"
            onClick={() => toast('Test-run sandbox opens here.')}
            className="inline-flex items-center gap-1 text-foreground/80 dark:text-foreground/65 hover:text-foreground"
          >
            <History className="h-3 w-3" />
            Test run
          </button>
        </div>
      )}
    </Glass>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'indigo' }) {
  const color = tone === 'emerald' ? 'text-emerald-700 dark:text-emerald-300' : tone === 'indigo' ? 'text-violet-700 dark:text-violet-300' : 'text-foreground';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">{label}</div>
      <div className={cn('mt-0.5 text-sm font-medium tabular-nums', color)}>{value}</div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
