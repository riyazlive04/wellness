import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, ClipboardList, Trophy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { clientProgramsApi, type TodayTask } from '@/modules/workspace/api/programEngine';

export default function ClientPrograms() {
  const qc = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const assignmentsQ = useQuery({ queryKey: ['me', 'programs', 'assigned'], queryFn: clientProgramsApi.assigned, retry: 1 });
  const tasksQ = useQuery({ queryKey: ['me', 'programs', 'today'], queryFn: clientProgramsApi.today, retry: 1 });
  const mealPlanQ = useQuery({ queryKey: ['me', 'program'], queryFn: () => clientsApi.myProgram(), retry: 1 });

  const toggleMut = useMutation({
    mutationFn: (taskId: string) => clientProgramsApi.toggle(taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me', 'programs', 'today'] });
      qc.invalidateQueries({ queryKey: ['me', 'programs', 'assigned'] });
    },
    onError: () => toast.error('Could not update task.'),
  });

  const assignments = (assignmentsQ.data ?? []).filter((a) => a.status === 'active');
  const tasks = tasksQ.data ?? [];
  const mealPlan = mealPlanQ.data;
  const hasAnything = assignments.length > 0 || tasks.length > 0 || !!mealPlan;

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Plan · Program</span>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Your program.</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65 md:text-base">What your nutritionist set up for you, and what to focus on today.</p>
        </motion.div>

        {!hasAnything && !assignmentsQ.isLoading && (
          <motion.div variants={fadeUp} className="mt-6">
            <Glass className="flex flex-col items-center gap-3 p-8 text-center">
              <ClipboardList className="h-6 w-6 text-foreground/35" />
              <div className="text-sm text-foreground/65">No program assigned yet. Your nutritionist will publish one once your wellness profile is in.</div>
            </Glass>
          </motion.div>
        )}

        {/* Active program assignments */}
        {assignments.map((a) => {
          const pct = a.progress?.pct ?? Math.round(Number(a.progress_pct));
          return (
            <motion.div key={a.id} variants={fadeUp} className="mt-6">
              <AIGlow intensity="soft" animated>
                <Glass variant="heavy" className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">{a.category?.replace('_', ' ') ?? 'Program'} · {a.status}</div>
                      <div className="mt-1 truncate text-xl font-semibold">{a.name}</div>
                      <div className="mt-1 text-xs text-foreground/65">{a.duration_weeks} weeks · started {new Date(a.start_date).toLocaleDateString()}</div>
                    </div>
                    <Trophy className="h-7 w-7 flex-shrink-0 text-amber-500" />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs tabular-nums text-foreground/60">{pct}%</span>
                  </div>
                </Glass>
              </AIGlow>
            </motion.div>
          );
        })}

        {/* Today's program tasks (real) */}
        {tasks.length > 0 && (
          <motion.div variants={fadeUp} className="mt-6">
            <h2 className="mb-3 text-base font-semibold">Today's focus</h2>
            <Glass className="p-2">
              <ul className="divide-y divide-foreground/[0.05]">
                {tasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => toggleMut.mutate(task.id)} busy={toggleMut.isPending} />)}
              </ul>
            </Glass>
            <p className="mt-2 text-[10px] text-foreground/45">Completing tasks builds your program progress.</p>
          </motion.div>
        )}

        {/* Legacy meal plan (weekly plan) */}
        {mealPlan && (
          <motion.div variants={fadeUp} className="mt-6">
            <h2 className="mb-3 text-base font-semibold">Meal plan</h2>
            <Glass className="p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Week {mealPlan.week_number} · {mealPlan.status ?? 'active'}</div>
              <div className="mt-1 text-lg font-semibold">{mealPlan.total_kcal ? `${mealPlan.total_kcal} kcal target` : 'Custom plan'}</div>
              <div className="mt-1 text-xs text-foreground/65">{new Date(mealPlan.start_date).toLocaleDateString()} → {new Date(mealPlan.end_date).toLocaleDateString()}</div>
            </Glass>
          </motion.div>
        )}
      </motion.div>
    </ClientLayout>
  );
}

function TaskRow({ task, onToggle, busy }: { task: TodayTask; onToggle: () => void; busy: boolean }) {
  return (
    <li>
      <button type="button" onClick={onToggle} disabled={busy} className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-foreground/[0.02]">
        {task.done ? <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" /> : <Circle className="h-5 w-5 flex-shrink-0 text-foreground/30" />}
        <span className="min-w-0 flex-1">
          <span className={task.done ? 'block text-sm text-foreground/55 line-through' : 'block text-sm'}>{task.title}</span>
          <span className="block text-[11px] text-foreground/45">{task.program}{task.type !== 'task' ? ` · ${task.type}` : ''}</span>
        </span>
      </button>
    </li>
  );
}
