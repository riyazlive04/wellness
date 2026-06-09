import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, ClipboardList, Trophy } from 'lucide-react';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';

export default function ClientPrograms() {
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const programQ = useQuery({ queryKey: ['me', 'program'], queryFn: () => clientsApi.myProgram(), retry: 1 });

  const program = programQ.data;

  // Synth daily tasks until backend ships /me/program/tasks. The legacy
  // ClientDashboard derived these from the program's meal plan + AI nudges.
  const dailyTasks = program
    ? [
        { id: 'breakfast', label: 'Log breakfast', done: false },
        { id: 'water',     label: 'Hit 2L of water', done: false },
        { id: 'walk',      label: 'Walk 20 minutes', done: false },
        { id: 'evening',   label: 'Log dinner before 9pm', done: false },
        { id: 'reflect',   label: 'Quick voice check-in with SIRAH', done: false },
      ]
    : [];

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10"
      >
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Plan · Program</span>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Your program.</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65 md:text-base">
            What your nutritionist set up for you, and what to focus on today.
          </p>
        </motion.div>

        {!program && (
          <motion.div variants={fadeUp} className="mt-6">
            <Glass className="flex flex-col items-center gap-3 p-8 text-center">
              <ClipboardList className="h-6 w-6 text-foreground/35" />
              <div className="text-sm text-foreground/65">
                No program assigned yet. Your nutritionist will publish one once your wellness profile is in.
              </div>
            </Glass>
          </motion.div>
        )}

        {program && (
          <>
            <motion.div variants={fadeUp} className="mt-6">
              <AIGlow intensity="soft" animated>
                <Glass variant="heavy" className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
                        Week {program.week_number} · {program.status ?? 'active'}
                      </div>
                      <div className="mt-1 text-xl font-semibold">
                        {program.total_kcal ? `${program.total_kcal} kcal target` : 'Custom plan'}
                      </div>
                      <div className="mt-1 text-xs text-foreground/65">
                        {new Date(program.start_date).toLocaleDateString()} → {new Date(program.end_date).toLocaleDateString()}
                      </div>
                    </div>
                    <Trophy className="h-7 w-7 text-amber-500" />
                  </div>
                </Glass>
              </AIGlow>
            </motion.div>

            <motion.div variants={fadeUp} className="mt-6">
              <h2 className="mb-3 text-base font-semibold">Today's focus</h2>
              <Glass className="p-4">
                <ul className="divide-y divide-foreground/[0.05]">
                  {dailyTasks.map((task) => (
                    <li key={task.id} className="flex items-center gap-3 py-3">
                      {task.done ? (
                        <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />
                      ) : (
                        <Circle className="h-5 w-5 flex-shrink-0 text-foreground/30" />
                      )}
                      <span className={task.done ? 'text-sm text-foreground/55 line-through' : 'text-sm'}>
                        {task.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </Glass>
              <p className="mt-2 text-[10px] text-foreground/45">
                Tasks unlock progress badges. Daily-task persistence is on the roadmap.
              </p>
            </motion.div>
          </>
        )}
      </motion.div>
    </ClientLayout>
  );
}