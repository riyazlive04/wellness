import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Clock, Repeat, Mail, Calendar, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { TemplateCard } from '@/modules/workspace/reports/components/TemplateCard';
import { GeneratedRow } from '@/modules/workspace/reports/components/GeneratedRow';
import {
  GENERATED,
  REPORT_TEMPLATES,
  SCHEDULED,
} from '@/modules/workspace/reports/data/mockReports';
import { cadenceLabel, relativeTime } from '@/modules/workspace/reports/helpers';
import { cn } from '@/lib/utils';

export default function OwnerReports() {
  const workspace = readWorkspace();
  const [filter, setFilter] = useState<'all' | 'ready' | 'in_progress'>('all');

  const visible = useMemo(() => {
    if (filter === 'all') return GENERATED;
    if (filter === 'ready') return GENERATED.filter((g) => g.status === 'ready');
    return GENERATED.filter((g) => g.status !== 'ready' && g.status !== 'failed');
  }, [filter]);

  const stats = useMemo(() => {
    const lastMonth = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const monthCount = GENERATED.filter((g) => new Date(g.generatedAt).getTime() >= lastMonth).length;
    return {
      monthCount,
      inProgress: GENERATED.filter((g) => g.status === 'generating' || g.status === 'queued').length,
      scheduledCount: SCHEDULED.length,
    };
  }, []);

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={`${GENERATED.length} reports · ${SCHEDULED.length} scheduled`}
      onSignOut={() => toast('Sign-out wiring lands with the auth context refactor.')}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-foreground/40">Reports</span>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
                PDFs, summaries, and audits
              </h1>
              <p className="mt-1 text-sm text-foreground/55">
                Generate on demand or schedule a recurring delivery — to you, your accountant, or a client's inbox.
              </p>
            </div>

            <button
              type="button"
              onClick={() => toast('Custom-report builder lands with the AI module — Reports + AI Assistant compose.')}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.03] px-4 py-2 text-sm text-foreground/85 transition-colors hover:bg-foreground/[0.06]"
            >
              <Plus className="h-3.5 w-3.5" />
              Custom report
            </button>
          </motion.div>

          {/* KPI strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KPICard
              icon={FileText}
              label="Generated this month"
              value={String(stats.monthCount)}
              hint="all kinds"
              accent="indigo"
            />
            <KPICard
              icon={Clock}
              label="In progress"
              value={String(stats.inProgress)}
              hint={stats.inProgress > 0 ? 'queued or generating' : 'nothing running'}
              accent="sand"
            />
            <KPICard
              icon={Repeat}
              label="Scheduled"
              value={String(stats.scheduledCount)}
              hint="recurring jobs"
              accent="sage"
            />
          </motion.div>

          {/* Templates grid */}
          <motion.section variants={fadeUp}>
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/40">Templates</div>
              <div className="text-sm font-medium text-foreground">Generate a report</div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {REPORT_TEMPLATES.map((t) => (
                <TemplateCard
                  key={t.kind}
                  template={t}
                  onGenerate={() =>
                    toast.success(
                      t.needsTarget
                        ? `Pick a ${t.needsTarget} to generate "${t.name}".`
                        : `Generating "${t.name}"… you'll see it in Recently generated below.`,
                    )
                  }
                  onSchedule={() => toast('Scheduling dialog opens — pick cadence, recipients, then save.')}
                />
              ))}
            </div>
          </motion.section>

          {/* Recently generated */}
          <motion.section variants={fadeUp}>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                  Recently generated
                </div>
                <div className="text-sm font-medium text-foreground">
                  PDFs land in your private workspace bucket
                </div>
              </div>

              <div className="flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] p-1">
                <FilterPill label="All" active={filter === 'all'} onClick={() => setFilter('all')} count={GENERATED.length} />
                <FilterPill
                  label="Ready"
                  active={filter === 'ready'}
                  onClick={() => setFilter('ready')}
                  count={GENERATED.filter((g) => g.status === 'ready').length}
                />
                <FilterPill
                  label="In progress"
                  active={filter === 'in_progress'}
                  onClick={() => setFilter('in_progress')}
                  count={stats.inProgress}
                />
              </div>
            </div>

            <Glass className="overflow-hidden">
              {/* Header */}
              <div className="hidden grid-cols-[1.6fr_1fr_120px_180px_120px] gap-3 border-b border-foreground/[0.04] px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/40 md:grid">
                <div>Report</div>
                <div>Generated by</div>
                <div>Size</div>
                <div>Status</div>
                <div className="text-right">Actions</div>
              </div>
              <ul>
                {visible.length === 0 ? (
                  <li className="px-5 py-10 text-center text-xs text-foreground/40">
                    No reports match this filter.
                  </li>
                ) : (
                  visible.map((r) => <GeneratedRow key={r.id} report={r} />)
                )}
              </ul>
            </Glass>
          </motion.section>

          {/* Scheduled */}
          <motion.section variants={fadeUp}>
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                Scheduled
              </div>
              <div className="text-sm font-medium text-foreground">Reports SIRAH delivers automatically</div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {SCHEDULED.map((s) => (
                <Glass key={s.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">{s.templateName}</div>
                      <div className="mt-0.5 text-[11px] text-foreground/45">
                        {cadenceLabel(s.cadence, s.dayOf, s.hourOf)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toast('Edit-schedule modal opens here.')}
                        className="grid h-7 w-7 place-items-center rounded-lg text-foreground/55 hover:bg-foreground/[0.05] hover:text-foreground"
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toast('Schedule removed.')}
                        className="grid h-7 w-7 place-items-center rounded-lg text-foreground/55 hover:bg-foreground/[0.05] hover:text-rose-300"
                        aria-label="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 border-t border-foreground/[0.04] pt-4 text-[11px]">
                    <Row icon={<Mail className="h-3 w-3" />}     label="Recipients" value={s.recipients.join(', ')} />
                    <Row icon={<Clock className="h-3 w-3" />}    label="Last sent"  value={s.lastSentAt ? relativeTime(s.lastSentAt) : 'never'} />
                    <Row icon={<Calendar className="h-3 w-3" />} label="Next run"   value={relativeTime(s.nextRunAt)} />
                  </div>
                </Glass>
              ))}
            </div>

            <div className="mt-4 text-[11px] text-foreground/35">
              Reports are PDF-generated server-side, signed, and stored in your private Supabase Storage bucket.
              Email + WhatsApp delivery respects each recipient's quiet hours.
            </div>
          </motion.section>
        </motion.div>
      </div>
    </OwnerLayout>
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
        active ? 'bg-foreground/[0.08] text-foreground' : 'text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground/85',
      )}
    >
      <span>{label}</span>
      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', active ? 'bg-foreground/15 text-foreground' : 'bg-foreground/[0.04] text-foreground/45')}>
        {count}
      </span>
    </button>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-foreground/65">
      <span className="text-foreground/40">{icon}</span>
      <span className="text-foreground/45">{label}</span>
      <span className="ml-auto truncate text-foreground/85">{value}</span>
    </div>
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
