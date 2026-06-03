import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  Clock,
  Users,
  Sparkles,
  Target,
  Activity,
  Pencil,
  PlayCircle,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { MOCK_PROGRAMS } from '@/modules/workspace/programs/data/mockPrograms';
import { ACCENT_STYLES, formatDuration, relativeDate } from '@/modules/workspace/programs/helpers';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'curriculum' | 'materials' | 'prompts';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',   label: 'Overview' },
  { id: 'curriculum', label: 'Curriculum' },
  { id: 'materials',  label: 'Materials' },
  { id: 'prompts',    label: 'AI prompts' },
];

export default function OwnerProgramDetail() {
  const { id } = useParams<{ id: string }>();
  const program = useMemo(() => MOCK_PROGRAMS.find((p) => p.id === id), [id]);
  const [tab, setTab] = useState<Tab>('overview');
  const workspace = readWorkspace();

  if (!program) {
    return (
      <OwnerLayout
        practiceName={workspace.practiceName}
        ownerName={workspace.ownerName}
        initials={workspace.initials}
        trialDaysLeft={28}
      >
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-xl font-semibold">Program not found</h1>
          <Link
            to="/programs"
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/70 hover:bg-foreground/[0.04]"
          >
            <ChevronLeft className="h-4 w-4" /> Back to programs
          </Link>
        </div>
      </OwnerLayout>
    );
  }

  const accent = ACCENT_STYLES[program.accent];

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-6 md:py-8">
        <motion.div variants={stagger(0.06, 0.04)} initial="initial" animate="animate" className="space-y-6">
          {/* Back link */}
          <motion.div variants={fadeUp}>
            <Link to="/programs" className="inline-flex items-center gap-1 text-xs text-foreground/75 dark:text-foreground/55 hover:text-foreground">
              <ChevronLeft className="h-3.5 w-3.5" />
              Programs
            </Link>
          </motion.div>

          {/* Header card */}
          <motion.div variants={fadeUp}>
            <Glass className="relative overflow-hidden">
              {/* Decorative accent strip */}
              <div className={cn('absolute inset-x-0 top-0 h-24 bg-gradient-to-b opacity-60', accent.header)} />

              <div className="relative p-6 md:p-8">
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                  <div className="flex-1">
                    {/* Tag row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]', accent.chip)}>
                        {program.specialization}
                      </span>
                      {program.aiAssisted && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/40 bg-violet-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-violet-700 dark:text-violet-200">
                          <Sparkles className="h-3 w-3" />
                          AI-assisted
                        </span>
                      )}
                      {program.isTemplate && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-foreground/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-foreground/70">
                          Template
                        </span>
                      )}
                    </div>

                    <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                      {program.name}
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/80 dark:text-foreground/65">
                      {program.description}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-foreground/75 dark:text-foreground/55">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDuration(program.durationWeeks)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {program.enrolledCount} enrolled
                      </span>
                      <span className="text-foreground/35">
                        Updated {relativeDate(program.updatedAt)}
                      </span>
                    </div>

                    {program.goals.length > 0 && (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Target className="h-3 w-3 text-violet-700 dark:text-violet-300" />
                        {program.goals.map((g) => (
                          <span
                            key={g}
                            className="rounded-full border border-foreground/10 bg-foreground/[0.03] px-2.5 py-0.5 text-[11px] text-foreground/70"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Header actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionPill
                      icon={Pencil}
                      label="Edit"
                      onClick={() => toast('Program editor lands with the curriculum-edit module.')}
                    />
                    <ActionPill
                      icon={PlayCircle}
                      label={program.isTemplate ? 'Activate & assign' : 'Assign to client'}
                      onClick={() => toast('Assignment flow wires to the Clients module next.')}
                      primary
                    />
                  </div>
                </div>

                {/* Stats row — only for active programs */}
                {!program.isTemplate && program.enrolledCount > 0 && (
                  <div className="mt-7 grid grid-cols-2 gap-4 border-t border-foreground/[0.06] pt-5 md:grid-cols-4">
                    <Stat label="Enrolled" value={String(program.enrolledCount)} />
                    <Stat label="Adherence" value={`${program.avgCompliance}%`} accent="emerald" />
                    <Stat label="Completion" value={`${program.completionRate}%`} accent="indigo" />
                    <Stat label="Duration" value={formatDuration(program.durationWeeks)} />
                  </div>
                )}
              </div>
            </Glass>
          </motion.div>

          {/* Tabs */}
          <motion.div variants={fadeUp}>
            <div className="flex gap-1 overflow-x-auto rounded-full bg-foreground/[0.03] p-1">
              {TABS.map((t) => {
                const active = t.id === tab;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`relative inline-flex items-center rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                      active ? 'text-foreground' : 'text-foreground/75 dark:text-foreground/55 hover:text-foreground/85'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="program-tab"
                        className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-600/35 to-fuchsia-500/25"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      />
                    )}
                    <span className="relative">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Tab content */}
          <motion.div variants={fadeUp}>
            {tab === 'overview'   && <OverviewTab program={program} />}
            {tab === 'curriculum' && <CurriculumTab program={program} />}
            {tab === 'materials'  && <ComingSoonTab label="Materials" />}
            {tab === 'prompts'    && <ComingSoonTab label="AI prompts" />}
          </motion.div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────

function OverviewTab({ program }: { program: typeof MOCK_PROGRAMS[number] }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      {/* Left: Description + key practices */}
      <Glass className="p-6">
        <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">About this program</div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">{program.description}</p>

        <div className="mt-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Weekly themes</div>
          <ul className="mt-3 space-y-2">
            {program.curriculum.map((w) => (
              <li key={w.week} className="flex items-start gap-3">
                <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-foreground/[0.04] text-[10px] font-semibold text-foreground/80">
                  W{w.week}
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-foreground/85">{w.theme}</div>
                  <div className="text-[11px] text-foreground/75 dark:text-foreground/60">{w.focusAreas.join(' · ')}</div>
                </div>
              </li>
            ))}
            {program.durationWeeks > program.curriculum.length && (
              <li className="text-xs text-foreground/75 dark:text-foreground/60">
                + {program.durationWeeks - program.curriculum.length} more weeks in curriculum
              </li>
            )}
          </ul>
        </div>
      </Glass>

      {/* Right: AI suggestions + metrics */}
      <div className="space-y-5">
        <AIGlow intensity="soft" animated>
          <Glass variant="heavy" className="p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20">
                <Sparkles className="h-4 w-4 text-violet-700 dark:text-violet-200" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
                  SIRAH suggests
                </div>
                <p className="mt-1 text-sm leading-relaxed text-foreground/85">
                  Consider adding a Week 5 inflection point with a check-in survey. Clients in
                  this band typically need recalibration around the 1-month mark.
                </p>
                <button
                  type="button"
                  onClick={() => toast('Curriculum patches will be applied via the AI module.')}
                  className="mt-3 inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.04] px-3 py-1 text-[11px] text-foreground/85 hover:bg-foreground/[0.08]"
                >
                  Apply suggestion
                </button>
              </div>
            </div>
          </Glass>
        </AIGlow>

        {!program.isTemplate && (
          <Glass className="p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Health</div>
            <ul className="mt-3 space-y-2.5 text-xs text-foreground/70">
              <li className="flex items-center justify-between">
                <span>Average adherence</span>
                <span className="font-medium text-emerald-700 dark:text-emerald-300">{program.avgCompliance}%</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Completion rate</span>
                <span className="font-medium text-violet-700 dark:text-violet-300">{program.completionRate}%</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Active enrollments</span>
                <span className="font-medium text-foreground">{program.enrolledCount}</span>
              </li>
            </ul>
          </Glass>
        )}
      </div>
    </div>
  );
}

function CurriculumTab({ program }: { program: typeof MOCK_PROGRAMS[number] }) {
  const [expanded, setExpanded] = useState<number | null>(1);

  // Render the configured curriculum, then placeholder weeks for the rest
  const allWeeks = useMemo(() => {
    const filled = [...program.curriculum];
    for (let i = filled.length + 1; i <= program.durationWeeks; i++) {
      filled.push({
        week: i,
        theme: 'Outline pending',
        focusAreas: ['SIRAH AI can draft this week'],
        highlights: [],
      });
    }
    return filled;
  }, [program]);

  return (
    <div className="space-y-3">
      {allWeeks.map((w) => {
        const isExpanded = expanded === w.week;
        const isPending = w.highlights.length === 0;
        return (
          <Glass key={w.week} className="overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded(isExpanded ? null : w.week)}
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-foreground/[0.02]"
            >
              <div className={cn(
                'grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-xs font-semibold',
                isPending ? 'bg-foreground/[0.04] text-foreground/75 dark:text-foreground/55' : 'bg-gradient-to-br from-blue-600/20 to-fuchsia-500/15 text-foreground',
              )}>
                W{w.week}
              </div>
              <div className="min-w-0 flex-1">
                <div className={cn('text-sm font-medium', isPending ? 'text-foreground/75 dark:text-foreground/55' : 'text-foreground')}>
                  {w.theme}
                </div>
                {!isPending && (
                  <div className="text-[11px] text-foreground/75 dark:text-foreground/60">{w.focusAreas.join(' · ')}</div>
                )}
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-foreground/75 dark:text-foreground/55 transition-transform',
                  isExpanded && 'rotate-180',
                )}
              />
            </button>

            {isExpanded && (
              <div className="border-t border-foreground/[0.04] px-5 py-4">
                {isPending ? (
                  <div className="text-xs text-foreground/75 dark:text-foreground/55">
                    No curriculum yet for this week.{' '}
                    <button
                      type="button"
                      onClick={() => toast('Curriculum drafting moves to the AI module.')}
                      className="text-violet-700 dark:text-violet-300 hover:text-violet-700 dark:text-violet-200"
                    >
                      Have SIRAH draft week {w.week}.
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                      What the client does this week
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {w.highlights.map((h) => (
                        <li key={h} className="flex items-start gap-2 text-sm text-foreground/80">
                          <Activity className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-700 dark:text-emerald-300" />
                          {h}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </Glass>
        );
      })}
    </div>
  );
}

function ComingSoonTab({ label }: { label: string }) {
  return (
    <Glass className="px-6 py-16 text-center">
      <h3 className="text-base font-medium tracking-tight">{label} coming soon</h3>
      <p className="mt-1 text-sm text-foreground/75 dark:text-foreground/55">
        This tab unlocks once we move the relevant module off Supabase Edge Functions.
      </p>
    </Glass>
  );
}

// ─── Tiny shared bits ────────────────────────────────────────────────────

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'emerald' | 'indigo';
}) {
  const color = accent === 'emerald'
    ? 'text-emerald-700 dark:text-emerald-300'
    : accent === 'indigo'
      ? 'text-violet-700 dark:text-violet-300'
      : 'text-foreground';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${color}`}>{value}</div>
    </div>
  );
}

function ActionPill({
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
        primary
          ? 'bg-gradient-to-br from-blue-600 to-fuchsia-500 text-foreground hover:scale-[1.02]'
          : 'border border-foreground/10 bg-foreground/[0.03] text-foreground/80 hover:bg-foreground/[0.06]'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
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
