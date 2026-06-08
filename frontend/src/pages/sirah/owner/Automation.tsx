import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Zap, Activity, Clock, TrendingUp, Sparkles, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { WorkflowCard } from '@/modules/workspace/automation/components/WorkflowCard';
import { FlowChain } from '@/modules/workspace/automation/components/FlowNode';
import {
  TEMPLATES,
  WORKFLOWS,
} from '@/modules/workspace/automation/data/mockAutomation';
import type { Template, Workflow, WorkflowStatus } from '@/modules/workspace/automation/types';
import { cn } from '@/lib/utils';

type FilterKey = 'all' | WorkflowStatus;

const ACCENT_HEADER: Record<Template['accent'], string> = {
  sage:   'from-emerald-400/30 to-transparent',
  indigo: 'from-violet-400/30 to-transparent',
  sand:   'from-amber-300/30 to-transparent',
  coral:  'from-rose-400/30 to-transparent',
};

export default function OwnerAutomation() {
  const workspace = readWorkspace();
  const [workflows, setWorkflows] = useState<Workflow[]>(WORKFLOWS);
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return workflows;
    return workflows.filter((w) => w.status === filter);
  }, [workflows, filter]);

  const stats = useMemo(() => {
    const active = workflows.filter((w) => w.status === 'active');
    return {
      activeCount:  active.length,
      runsThisMonth: workflows.reduce((a, w) => a + w.runsThisMonth, 0),
      avgSuccess:   active.length
        ? Math.round(active.reduce((a, w) => a + w.successRate, 0) / active.length)
        : 0,
      hoursSaved:   workflows.reduce((a, w) => a + w.timeSavedHours, 0),
    };
  }, [workflows]);

  function toggle(id: string) {
    setWorkflows((ws) =>
      ws.map((w) =>
        w.id === id
          ? { ...w, status: w.status === 'active' ? 'paused' : 'active' }
          : w,
      ),
    );
    toast.success('Workflow toggled.');
  }

  function remove(id: string) {
    setWorkflows((ws) => ws.filter((w) => w.id !== id));
    toast.success('Workflow removed.');
  }

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={`${stats.activeCount} active · ${stats.runsThisMonth} runs this month`}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-400/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-200">
                <Zap className="h-3 w-3" />
                Automation
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                Workflows that quietly run your practice
              </h1>
              <p className="mt-1 text-sm text-foreground/75 dark:text-foreground/55">
                Set rules once. SIRAH watches the workspace, drafts the message, and lands the
                outcome — always with your final approval.
              </p>
            </div>

            <button
              type="button"
              onClick={() => toast('Workflow builder opens — drag triggers → conditions → actions onto the canvas.')}
              className="inline-flex w-fit items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-foreground transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              New workflow
            </button>
          </motion.div>

          {/* AI insight */}
          <motion.div variants={fadeUp}>
            <AIGlow intensity="soft" animated>
              <Glass variant="heavy" className="p-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20">
                    <Sparkles className="h-4 w-4 text-violet-700 dark:text-violet-200" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
                      SIRAH suggestion
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-foreground/85">
                      Your "Silent client check-in" workflow has caught {stats.activeCount > 0 ? '18' : '0'} silences this month, saving roughly{' '}
                      <span className="text-emerald-700 dark:text-emerald-300">{stats.hoursSaved.toFixed(1)} hours</span>. Want me to draft a complementary workflow
                      that escalates to a call request if the client doesn't respond in 48 hours?
                    </p>
                    <button
                      type="button"
                      onClick={() => toast('Draft workflow appears in your list as a Draft for review.')}
                      className="mt-3 inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.04] px-3 py-1 text-[11px] text-foreground/85 hover:bg-foreground/[0.08]"
                    >
                      Draft the escalation workflow
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </Glass>
            </AIGlow>
          </motion.div>

          {/* KPI strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KPICard icon={Zap}        label="Active workflows" value={String(stats.activeCount)} hint={`${workflows.length - stats.activeCount} paused or draft`} accent="indigo" />
            <KPICard icon={Activity}   label="Runs this month"  value={stats.runsThisMonth.toLocaleString('en-IN')} hint="across all workflows" accent="sage" />
            <KPICard icon={TrendingUp} label="Success rate"     value={`${stats.avgSuccess}%`}    hint="active workflows avg" accent="sage" />
            <KPICard icon={Clock}      label="Hours saved"      value={`${stats.hoursSaved.toFixed(1)}`} hint="this month, estimated" accent="sand" />
          </motion.div>

          {/* Templates row */}
          <motion.section variants={fadeUp}>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Templates</div>
                <div className="text-sm font-medium text-foreground">Common workflows you can adopt in one tap</div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {TEMPLATES.map((t) => (
                <TemplatePreview
                  key={t.id}
                  template={t}
                  onAdopt={() => {
                    setWorkflows((ws) => [
                      {
                        id: `wf_${Math.random().toString(36).slice(2, 7)}`,
                        name: t.name,
                        description: t.description,
                        status: 'draft',
                        nodes: t.nodes,
                        runsThisMonth: 0,
                        successRate: 0,
                        timeSavedHours: 0,
                      },
                      ...ws,
                    ]);
                    toast.success(`"${t.name}" added as a draft. Review and activate it below.`);
                  }}
                />
              ))}
            </div>
          </motion.section>

          {/* Workflows list */}
          <motion.section variants={fadeUp}>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Your workflows</div>
                <div className="text-sm font-medium text-foreground">{workflows.length} configured</div>
              </div>

              <div className="flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] p-1">
                <FilterPill label="All"     count={workflows.length}                                          active={filter === 'all'}    onClick={() => setFilter('all')} />
                <FilterPill label="Active"  count={workflows.filter((w) => w.status === 'active').length}    active={filter === 'active'} onClick={() => setFilter('active')} />
                <FilterPill label="Paused"  count={workflows.filter((w) => w.status === 'paused').length}    active={filter === 'paused'} onClick={() => setFilter('paused')} />
                <FilterPill label="Drafts"  count={workflows.filter((w) => w.status === 'draft').length}     active={filter === 'draft'}  onClick={() => setFilter('draft')} />
              </div>
            </div>

            {filtered.length === 0 ? (
              <Glass className="px-6 py-16 text-center">
                <Zap className="mx-auto h-6 w-6 text-foreground/30" />
                <h3 className="mt-3 text-base font-medium tracking-tight">No workflows in this view</h3>
                <p className="mt-1 text-sm text-foreground/75 dark:text-foreground/55">Try a different filter or adopt a template above.</p>
              </Glass>
            ) : (
              <div className="space-y-4">
                {filtered.map((w) => (
                  <WorkflowCard
                    key={w.id}
                    workflow={w}
                    onToggle={toggle}
                    onEdit={() => toast(`Edit canvas for "${w.name}" opens here.`)}
                    onRemove={remove}
                  />
                ))}
              </div>
            )}
          </motion.section>

          {/* Footer hint */}
          <motion.div variants={fadeUp} className="text-[11px] text-foreground/35">
            Workflows run on a backend queue (BullMQ + Redis). Each action is logged in the audit
            log and respects the recipient's quiet hours from the Notifications module.
          </motion.div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

// ─── Template preview card ───────────────────────────────────────────────

function TemplatePreview({ template, onAdopt }: { template: Template; onAdopt: () => void }) {
  return (
    <Glass interactive className="relative h-full overflow-hidden">
      {/* Top accent strip */}
      <div className={cn('h-12 bg-gradient-to-br', ACCENT_HEADER[template.accent])} />

      <div className="px-4 pb-4 pt-3">
        <div className="text-sm font-medium tracking-tight text-foreground">{template.name}</div>
        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-foreground/75 dark:text-foreground/55">{template.description}</p>

        <div className="mt-3 overflow-x-auto">
          <FlowChain nodes={template.nodes} compact />
        </div>

        <div className="mt-4 flex items-center justify-between text-[11px]">
          <span className="text-foreground/75 dark:text-foreground/60">{template.estimatedRuns}</span>
          <button
            type="button"
            onClick={onAdopt}
            className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-foreground/85 hover:bg-foreground/[0.06]"
          >
            Adopt
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </Glass>
  );
}

function FilterPill({
  label, count, active, onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors',
        active ? 'bg-foreground/[0.08] text-foreground' : 'text-foreground/75 dark:text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground/85',
      )}
    >
      <span>{label}</span>
      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', active ? 'bg-foreground/15 text-foreground' : 'bg-foreground/[0.04] text-foreground/75 dark:text-foreground/60')}>
        {count}
      </span>
    </button>
  );
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
