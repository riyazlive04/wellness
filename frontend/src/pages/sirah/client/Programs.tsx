import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, ClipboardList, Trophy, Loader2, Plus, Check, Target, ChevronRight, Star, Sparkles, CalendarDays, ListChecks, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { clientProgramsApi, type TodayTask, type CatalogProgram } from '@/modules/workspace/api/programEngine';
import { cn } from '@/lib/utils';

const ACCENT_GRADIENT: Record<string, string> = {
  violet: 'from-violet-500 to-fuchsia-500', blue: 'from-blue-600 to-cyan-500',
  emerald: 'from-emerald-500 to-teal-500', amber: 'from-amber-500 to-orange-500',
  rose: 'from-rose-500 to-pink-500', indigo: 'from-indigo-500 to-violet-600',
  teal: 'from-teal-500 to-emerald-500', slate: 'from-slate-600 to-slate-800',
};
const accentGradient = (k: string | null) => ACCENT_GRADIENT[k ?? ''] ?? ACCENT_GRADIENT.violet;

export default function ClientPrograms() {
  const qc = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const assignmentsQ = useQuery({ queryKey: ['me', 'programs', 'assigned'], queryFn: clientProgramsApi.assigned, retry: 1 });
  const tasksQ = useQuery({ queryKey: ['me', 'programs', 'today'], queryFn: clientProgramsApi.today, retry: 1 });
  const mealPlanQ = useQuery({ queryKey: ['me', 'program'], queryFn: () => clientsApi.myProgram(), retry: 1 });
  const catalogQ = useQuery({ queryKey: ['me', 'programs', 'catalog'], queryFn: clientProgramsApi.catalog, retry: 1 });

  const toggleMut = useMutation({
    mutationFn: (taskId: string) => clientProgramsApi.toggle(taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me', 'programs', 'today'] });
      qc.invalidateQueries({ queryKey: ['me', 'programs', 'assigned'] });
    },
    onError: () => toast.error('Could not update task.'),
  });

  function refreshPrograms() {
    qc.invalidateQueries({ queryKey: ['me', 'programs', 'catalog'] });
    qc.invalidateQueries({ queryKey: ['me', 'programs', 'assigned'] });
    qc.invalidateQueries({ queryKey: ['me', 'programs', 'today'] });
  }

  const enrollMut = useMutation({
    mutationFn: (templateId: string) => clientProgramsApi.enroll(templateId),
    onSuccess: () => { toast.success('Joined the program.'); refreshPrograms(); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not join.'),
  });
  const leaveMut = useMutation({
    mutationFn: (templateId: string) => clientProgramsApi.leave(templateId),
    onSuccess: () => { toast('Left the program.'); refreshPrograms(); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not leave.'),
  });
  const pendingTemplate = enrollMut.isPending ? enrollMut.variables : leaveMut.isPending ? leaveMut.variables : null;

  const assignments = (assignmentsQ.data ?? []).filter((a) => a.status === 'active');
  const tasks = tasksQ.data ?? [];
  const mealPlan = mealPlanQ.data;
  const catalog = catalogQ.data ?? [];
  const hasAnything = assignments.length > 0 || tasks.length > 0 || !!mealPlan || catalog.length > 0;

  // Headline assignment + derived stats for the dashboard strip.
  const primary = assignments[0];
  const primaryPct = primary ? (primary.progress?.pct ?? Math.round(Number(primary.progress_pct))) : 0;
  const tasksDone = tasks.filter((t) => t.done).length;
  const weekNumber = mealPlan?.week_number ?? null;
  const showStats = assignments.length > 0 || tasks.length > 0 || weekNumber != null;

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <div className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 md:px-8 md:py-10">
        <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp}>
            <div className="flex items-center gap-2 text-violet-600 dark:text-violet-300">
              <ClipboardList className="h-4 w-4" /><span className="text-xs uppercase tracking-[0.18em]">Plan · Program</span>
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Your program</h1>
            <p className="mt-1.5 text-sm text-foreground/60">What your nutritionist set up for you, and what to focus on today.</p>
          </motion.div>

          {/* Stat strip */}
          {showStats && (
            <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile icon={Trophy} label="Active program" value={primary ? primary.name : '—'} tint="text-amber-600 dark:text-amber-300" />
              <StatTile icon={CalendarDays} label="Week" value={weekNumber != null ? `Week ${weekNumber}` : (primary ? `${primary.duration_weeks}w plan` : '—')} tint="text-blue-600 dark:text-blue-300" />
              <StatTile icon={Sparkles} label="Progress" value={primary ? `${primaryPct}%` : '—'} tint="text-violet-600 dark:text-violet-300" />
              <StatTile icon={ListChecks} label="Tasks done" value={tasks.length > 0 ? `${tasksDone}/${tasks.length}` : '—'} tint="text-emerald-600 dark:text-emerald-300" />
            </motion.div>
          )}

          {/* Empty state */}
          {!hasAnything && !assignmentsQ.isLoading && (
            <motion.div variants={fadeUp}>
              <Glass className="flex flex-col items-center gap-4 px-6 py-16 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-violet-700 dark:text-violet-300">
                  <ClipboardList className="h-6 w-6" />
                </div>
                <div className="max-w-md">
                  <div className="text-base font-semibold">No program assigned yet</div>
                  <p className="mt-1.5 text-sm text-foreground/60">Your nutritionist will publish one once your wellness profile is in. In the meantime, set a goal or write a reflection to get started.</p>
                </div>
                <Link to="/portal/goals" className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.02]">
                  Set a goal <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Glass>
            </motion.div>
          )}

          {/* Active program assignments */}
          {assignments.length > 0 && (
            <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {assignments.map((a) => {
                const pct = a.progress?.pct ?? Math.round(Number(a.progress_pct));
                return (
                  <AIGlow key={a.id} intensity="soft" animated>
                    <Glass variant="heavy" className="h-full p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">{a.category?.replace('_', ' ') ?? 'Program'} · {a.status}</div>
                          <div className="mt-1 truncate text-xl font-semibold">{a.name}</div>
                          <div className="mt-1 text-xs text-foreground/65">{a.duration_weeks} weeks · started {new Date(a.start_date).toLocaleDateString()}</div>
                        </div>
                        <Trophy className="h-7 w-7 flex-shrink-0 text-amber-500" />
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-foreground/60">{pct}%</span>
                      </div>
                    </Glass>
                  </AIGlow>
                );
              })}
            </motion.div>
          )}

          {/* Body: today's focus + meal plan aside */}
          {(tasks.length > 0 || mealPlan) && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              {/* Today's focus */}
              {tasks.length > 0 && (
                <motion.div variants={fadeUp} className={cn(mealPlan ? 'lg:col-span-2' : 'lg:col-span-3')}>
                  <Glass className="overflow-hidden">
                    <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                      <span className="text-sm font-medium">Today's focus</span>
                      <span className="text-[11px] text-foreground/45">{tasksDone}/{tasks.length} done</span>
                    </div>
                    <ul className="divide-y divide-foreground/[0.05]">
                      {tasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => toggleMut.mutate(task.id)} busy={toggleMut.isPending} />)}
                    </ul>
                    <p className="border-t border-foreground/[0.06] px-5 py-3 text-[11px] text-foreground/45">Completing tasks builds your program progress.</p>
                  </Glass>
                </motion.div>
              )}

              {/* Legacy meal plan (weekly plan) */}
              {mealPlan && (
                <motion.div variants={fadeUp} className={cn(tasks.length > 0 ? '' : 'lg:col-span-3')}>
                  <Glass className="h-full overflow-hidden">
                    <div className="border-b border-foreground/[0.06] px-5 py-4">
                      <span className="text-sm font-medium">Meal plan</span>
                    </div>
                    <div className="p-5">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Week {mealPlan.week_number} · {mealPlan.status ?? 'active'}</div>
                      <div className="mt-1 text-lg font-semibold">{mealPlan.total_kcal ? `${mealPlan.total_kcal} kcal target` : 'Custom plan'}</div>
                      <div className="mt-1 text-xs text-foreground/65">{new Date(mealPlan.start_date).toLocaleDateString()} → {new Date(mealPlan.end_date).toLocaleDateString()}</div>
                    </div>
                  </Glass>
                </motion.div>
              )}
            </div>
          )}

          {/* Browse programs — self-enroll */}
          {catalog.length > 0 && (
            <motion.div variants={fadeUp}>
              <div className="mb-3">
                <h2 className="text-base font-semibold">Browse programs</h2>
                <p className="text-xs text-foreground/55">Programs your nutritionist published. Join the ones you want — you can join more than one.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {catalog.map((p) => (
                  <CatalogCard
                    key={p.id}
                    p={p}
                    busy={pendingTemplate === p.id}
                    onJoin={() => enrollMut.mutate(p.id)}
                    onLeave={() => leaveMut.mutate(p.id)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </ClientLayout>
  );
}

function StatTile({ icon: Icon, label, value, tint }: { icon: LucideIcon; label: string; value: string; tint: string }) {
  return (
    <Glass className="p-4">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-3.5 w-3.5', tint)} strokeWidth={1.8} />
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</span>
      </div>
      <div className="mt-2 truncate text-lg font-semibold tracking-tight">{value}</div>
    </Glass>
  );
}

function CatalogCard({ p, busy, onJoin, onLeave }: { p: CatalogProgram; busy: boolean; onJoin: () => void; onLeave: () => void }) {
  const full = p.max_enrollments != null && p.enrolled_count >= p.max_enrollments && !p.enrolled;
  const closed = !p.allow_enrollment && !p.enrolled;
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); fn(); };

  return (
    <Link to={`/portal/programs/${p.id}`} className="group flex h-full flex-col overflow-hidden rounded-2xl">
      <Glass className="flex h-full flex-col overflow-hidden transition-colors group-hover:bg-foreground/[0.02]">
        {/* Cover or accent strip */}
        {p.cover_image_url ? (
          <div className="relative h-24 w-full overflow-hidden">
            <img src={p.cover_image_url} alt="" className="h-full w-full object-cover" />
            {p.featured && <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur"><Star className="h-2.5 w-2.5" /> Featured</span>}
          </div>
        ) : (
          <div className={cn('h-1.5 bg-gradient-to-r', accentGradient(p.accent_color))} />
        )}
        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start gap-3">
            <span className={cn('grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br text-sm font-semibold text-white', accentGradient(p.accent_color))}>
              {p.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold">{p.name}</span>
                {!p.cover_image_url && p.featured && <Star className="h-3 w-3 flex-shrink-0 text-amber-500" />}
              </div>
              <div className="text-[11px] capitalize text-foreground/55">
                {p.category.replace('_', ' ')} · {p.duration_weeks}{p.duration_unit === 'days' ? 'd' : 'w'} · {p.difficulty}
              </div>
            </div>
          </div>

          {p.tagline ? <p className="mt-2 line-clamp-2 text-xs text-foreground/65">{p.tagline}</p>
            : p.description && <p className="mt-2 line-clamp-2 text-xs text-foreground/60">{p.description}</p>}

          {p.goals?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {p.goals.slice(0, 3).map((g) => (
                <span key={g} className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[10px] text-foreground/65">
                  <Target className="h-2.5 w-2.5 text-foreground/40" />{g}
                </span>
              ))}
            </div>
          )}

          {p.max_enrollments != null && !p.enrolled && (
            <div className="mt-2 text-[10px] text-foreground/45">{Math.max(0, p.max_enrollments - p.enrolled_count)} spot{p.max_enrollments - p.enrolled_count === 1 ? '' : 's'} left</div>
          )}

          <div className="mt-auto pt-3">
            {p.enrolled ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <Check className="h-3.5 w-3.5" /> Joined
                </span>
                <button type="button" onClick={stop(onLeave)} disabled={busy}
                  className="rounded-full border border-foreground/10 px-3 py-2 text-xs text-foreground/60 hover:bg-foreground/[0.04] disabled:opacity-50">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Leave'}
                </button>
              </div>
            ) : full || closed ? (
              <div className="flex items-center justify-between rounded-full border border-foreground/10 px-3 py-2 text-xs text-foreground/50">
                {full ? 'Program full' : 'Enrollment closed'}<ChevronRight className="h-3.5 w-3.5" />
              </div>
            ) : (
              <button type="button" onClick={stop(onJoin)} disabled={busy}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Join program
              </button>
            )}
          </div>
        </div>
      </Glass>
    </Link>
  );
}

function TaskRow({ task, onToggle, busy }: { task: TodayTask; onToggle: () => void; busy: boolean }) {
  return (
    <li>
      <button type="button" onClick={onToggle} disabled={busy} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-foreground/[0.02]">
        {task.done ? <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" /> : <Circle className="h-5 w-5 flex-shrink-0 text-foreground/30" />}
        <span className="min-w-0 flex-1">
          <span className={task.done ? 'block text-sm text-foreground/55 line-through' : 'block text-sm'}>{task.title}</span>
          <span className="block text-[11px] text-foreground/45">{task.program}{task.type !== 'task' ? ` · ${task.type}` : ''}</span>
        </span>
      </button>
    </li>
  );
}
