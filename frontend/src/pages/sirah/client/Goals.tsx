import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Target, Plus, Trash2, Loader2, Check, Trophy } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { wellnessApi, type Goal } from '@/modules/wellness/api';
import { cn } from '@/lib/utils';

const CATEGORIES = ['lifestyle', 'fitness', 'nutrition', 'habit', 'mindfulness', 'other'];
const CAT_COLOR: Record<string, string> = {
  lifestyle: 'bg-violet-400/15 text-violet-600 dark:text-violet-300',
  fitness: 'bg-blue-400/15 text-blue-600 dark:text-blue-300',
  nutrition: 'bg-emerald-400/15 text-emerald-600 dark:text-emerald-300',
  habit: 'bg-orange-400/15 text-orange-600 dark:text-orange-300',
  mindfulness: 'bg-fuchsia-400/15 text-fuchsia-600 dark:text-fuchsia-300',
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

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <div className="mx-auto w-full max-w-2xl px-5 py-6">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-5">
          <motion.div variants={fadeUp}>
            <div className="flex items-center gap-2 text-violet-600 dark:text-violet-300">
              <Target className="h-4 w-4" /><span className="text-xs uppercase tracking-[0.18em]">Goals</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">What you're working toward</h1>
          </motion.div>

          {/* Add goal */}
          <motion.div variants={fadeUp}>
            <Glass className="space-y-2.5 p-4">
              <input
                value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="New goal — e.g. Walk 10,000 steps daily"
                className="h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-violet-400/50 focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-2">
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="h-9 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 text-xs capitalize focus:outline-none">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input value={target} onChange={(e) => setTarget(e.target.value)} type="number" placeholder="Target"
                  className="h-9 w-24 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 text-xs focus:outline-none" />
                <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit"
                  className="h-9 w-20 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 text-xs focus:outline-none" />
                <button type="button" onClick={() => title.trim() && addMut.mutate()} disabled={!title.trim() || addMut.isPending}
                  className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-br from-blue-600 to-fuchsia-500 px-3 text-xs font-medium text-white disabled:opacity-40">
                  {addMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
                </button>
              </div>
            </Glass>
          </motion.div>

          {goalsQ.isLoading ? (
            <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
          ) : goals.length === 0 ? (
            <motion.div variants={fadeUp}><Glass className="p-8 text-center">
              <Target className="mx-auto h-8 w-8 text-foreground/25" />
              <div className="mt-3 text-sm text-foreground/70">No goals yet — add one above.</div>
            </Glass></motion.div>
          ) : (
            <>
              <motion.div variants={fadeUp} className="space-y-2.5">
                {active.map((g) => (
                  <GoalCard key={g.id} goal={g}
                    onProgress={(v) => updateMut.mutate({ id: g.id, body: { currentValue: v } })}
                    onAchieve={() => updateMut.mutate({ id: g.id, body: { status: 'achieved' } })}
                    onDelete={() => delMut.mutate(g.id)} />
                ))}
              </motion.div>
              {done.length > 0 && (
                <motion.div variants={fadeUp} className="space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                    <Trophy className="h-3.5 w-3.5" /> Achieved
                  </div>
                  {done.map((g) => (
                    <GoalCard key={g.id} goal={g} onDelete={() => delMut.mutate(g.id)} />
                  ))}
                </motion.div>
              )}
            </>
          )}
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
    <Glass className={cn('group p-4', achieved && 'opacity-80')}>
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
    </Glass>
  );
}
