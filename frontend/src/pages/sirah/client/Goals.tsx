import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Target, Plus, Trash2, Loader2, Check, Trophy, Sparkles, ListChecks } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { wellnessApi, type Goal } from '@/modules/wellness/api';
import { cn } from '@/lib/utils';

const CATEGORIES = ['lifestyle', 'fitness', 'nutrition', 'habit', 'mindfulness', 'other'];
const CAT_COLOR: Record<string, string> = {
  lifestyle: 'bg-teal-400/15 text-teal-600 dark:text-teal-300',
  fitness: 'bg-blue-400/15 text-blue-600 dark:text-blue-300',
  nutrition: 'bg-emerald-400/15 text-emerald-600 dark:text-emerald-300',
  habit: 'bg-orange-400/15 text-orange-600 dark:text-orange-300',
  mindfulness: 'bg-cyan-400/15 text-cyan-600 dark:text-cyan-300',
  other: 'bg-foreground/[0.06] text-foreground/60',
};

export default function ClientGoals() {
  const qc = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const goalsQ = useQuery({ queryKey: ['wellness', 'goals'], queryFn: wellnessApi.listGoals });

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('lifestyle');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['wellness', 'goals'] });

  const addMut = useMutation({
    mutationFn: () => wellnessApi.createGoal({
      title: title.trim(), category,
      ...(target ? { targetValue: Number(target) } : {}),
      ...(unit ? { unit } : {}),
    }),
    onSuccess: () => { setTitle(''); setTarget(''); setUnit(''); invalidate(); },
    onError: () => toast.error('Could not add goal.'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => wellnessApi.updateGoal(id, body),
    onSuccess: invalidate, onError: () => toast.error('Could not update goal.'),
  });
  const delMut = useMutation({ mutationFn: (id: string) => wellnessApi.deleteGoal(id), onSuccess: invalidate });

  const goals = goalsQ.data ?? [];
  const active = goals.filter((g) => g.status === 'active');
  const done = goals.filter((g) => g.status === 'achieved');

  // Derived summary numbers for the stat strip.
  const withTarget = active.filter((g) => g.target_value && Number(g.target_value) > 0);
  const avgProgress = withTarget.length
    ? Math.round(
        withTarget.reduce((acc, g) => {
          const t = Number(g.target_value);
          const c = Number(g.current_value);
          return acc + Math.min(100, (c / t) * 100);
        }, 0) / withTarget.length,
      )
    : 0;

  const STATS = [
    { label: 'Total', value: goals.length, tint: 'text-teal-600 dark:text-teal-300', icon: Target },
    { label: 'Active', value: active.length, tint: 'text-blue-600 dark:text-blue-300', icon: ListChecks },
    { label: 'Achieved', value: done.length, tint: 'text-emerald-600 dark:text-emerald-300', icon: Trophy },
    { label: 'Avg progress', value: `${avgProgress}%`, tint: 'text-cyan-600 dark:text-cyan-300', icon: Sparkles },
  ];

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <div className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 md:px-8 md:py-10">
        <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp}>
            <div className="flex items-center gap-2 text-teal-600 dark:text-teal-300">
              <Target className="h-4 w-4" /><span className="text-xs uppercase tracking-[0.18em]">Goals</span>
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">What you're working toward</h1>
            <p className="mt-1.5 text-sm text-foreground/60">Set targets, track your progress and celebrate every milestone.</p>
          </motion.div>

          {/* Stat strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATS.map((s) => (
              <Glass key={s.label} className="p-4">
                <div className="flex items-center gap-2">
                  <s.icon className={cn('h-3.5 w-3.5', s.tint)} strokeWidth={1.8} />
                  <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{s.label}</span>
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">{s.value}</div>
              </Glass>
            ))}
          </motion.div>

          {/* Body: goal lists + add panel */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Main column: active + achieved goals */}
            <motion.div variants={fadeUp} className="space-y-5 lg:col-span-2">
              {goalsQ.isLoading ? (
                <Glass className="py-16 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" />
                </Glass>
              ) : goals.length === 0 ? (
                <Glass className="flex flex-col items-center px-5 py-16 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-300">
                    <Target className="h-6 w-6" />
                  </div>
                  <div className="mt-3 text-sm font-medium">No goals yet</div>
                  <div className="mt-1 max-w-xs text-xs text-foreground/55">
                    Add your first goal using the panel on the right and start tracking your progress.
                  </div>
                </Glass>
              ) : (
                <>
                  <Glass className="overflow-hidden">
                    <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <ListChecks className="h-4 w-4 text-blue-600 dark:text-blue-300" /> In progress
                      </span>
                      <span className="text-[11px] text-foreground/45">{active.length} {active.length === 1 ? 'goal' : 'goals'}</span>
                    </div>
                    {active.length === 0 ? (
                      <div className="flex flex-col items-center px-5 py-12 text-center">
                        <Trophy className="h-7 w-7 text-foreground/25" />
                        <div className="mt-2 text-sm text-foreground/70">All goals achieved</div>
                        <div className="mt-1 text-xs text-foreground/50">Nice work - add a new one to keep the momentum going.</div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                        {active.map((g) => (
                          <GoalCard key={g.id} goal={g}
                            onProgress={(v) => updateMut.mutate({ id: g.id, body: { currentValue: v } })}
                            onAchieve={() => updateMut.mutate({ id: g.id, body: { status: 'achieved' } })}
                            onDelete={() => delMut.mutate(g.id)} />
                        ))}
                      </div>
                    )}
                  </Glass>

                  {done.length > 0 && (
                    <Glass className="overflow-hidden">
                      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                        <span className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-300">
                          <Trophy className="h-4 w-4" /> Achieved
                        </span>
                        <span className="text-[11px] text-foreground/45">{done.length}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                        {done.map((g) => (
                          <GoalCard key={g.id} goal={g} onDelete={() => delMut.mutate(g.id)} />
                        ))}
                      </div>
                    </Glass>
                  )}
                </>
              )}
            </motion.div>

            {/* Side: add goal */}
            <motion.div variants={fadeUp} className="space-y-5">
              <Glass className="overflow-hidden">
                <div className="flex items-center gap-2 border-b border-foreground/[0.06] px-5 py-4">
                  <Plus className="h-4 w-4 text-teal-600 dark:text-teal-300" />
                  <span className="text-sm font-medium">Add a goal</span>
                </div>
                <div className="space-y-3 p-4">
                  <input
                    value={title} onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Walk 10,000 steps daily"
                    className="h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-teal-400/50 focus:outline-none"
                  />
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger aria-label="Goal category"
                      className="h-10 w-full rounded-xl border-foreground/10 bg-foreground/[0.03] px-3 text-sm capitalize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <input value={target} onChange={(e) => setTarget(e.target.value)} type="number" placeholder="Target"
                      className="h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-teal-400/50 focus:outline-none" />
                    <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit"
                      className="h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-teal-400/50 focus:outline-none" />
                  </div>
                  <button type="button" onClick={() => title.trim() && addMut.mutate()} disabled={!title.trim() || addMut.isPending}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-3 text-sm font-medium text-white transition-opacity disabled:opacity-40">
                    {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add goal
                  </button>
                  <p className="text-[11px] leading-relaxed text-foreground/50">
                    Add a target value and unit to track progress with a progress bar.
                  </p>
                </div>
              </Glass>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </ClientLayout>
  );
}

function GoalCard({ goal, onProgress, onAchieve, onDelete }: {
  goal: Goal; onProgress?: (v: number) => void; onAchieve?: () => void; onDelete: () => void;
}) {
  const achieved = goal.status === 'achieved';
  const target = goal.target_value ? Number(goal.target_value) : null;
  const current = Number(goal.current_value);
  const pct = target && target > 0 ? Math.min(100, Math.round((current / target) * 100)) : null;

  return (
    <div className={cn('group rounded-2xl border border-foreground/[0.06] bg-foreground/[0.015] p-4 transition-colors hover:bg-foreground/[0.04]', achieved && 'opacity-80')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('truncate text-sm font-medium', achieved && 'line-through text-foreground/50')}>{goal.title}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] capitalize', CAT_COLOR[goal.category] ?? CAT_COLOR.other)}>{goal.category}</span>
          </div>
          {goal.description && <div className="mt-0.5 text-xs text-foreground/55">{goal.description}</div>}

          {pct !== null && (
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[11px] text-foreground/60">
                <span>{current}{goal.unit ? ` ${goal.unit}` : ''} / {target}{goal.unit ? ` ${goal.unit}` : ''}</span>
                <span>{pct}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {!achieved && (
            <div className="mt-3 flex items-center gap-2">
              {target !== null && onProgress && (
                <button type="button" onClick={() => onProgress(current + 1)}
                  className="rounded-full border border-foreground/10 bg-foreground/[0.03] px-2.5 py-1 text-[11px] text-foreground/70 hover:bg-foreground/[0.06]">+1{goal.unit ? ` ${goal.unit}` : ''}</button>
              )}
              {onAchieve && (
                <button type="button" onClick={onAchieve}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/[0.08] px-2.5 py-1 text-[11px] font-medium text-emerald-600 hover:bg-emerald-400/[0.15] dark:text-emerald-300">
                  <Check className="h-3 w-3" /> Mark achieved
                </button>
              )}
            </div>
          )}
        </div>
        <button type="button" onClick={onDelete} className="opacity-0 transition-opacity group-hover:opacity-100">
          <Trash2 className="h-4 w-4 text-foreground/30 hover:text-rose-500" />
        </button>
      </div>
    </div>
  );
}
