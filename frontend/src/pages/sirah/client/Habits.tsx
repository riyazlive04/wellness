import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Flame, Check, Plus, Trash2, Loader2, Repeat } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { wellnessApi, type Habit } from '@/modules/wellness/api';
import { cn } from '@/lib/utils';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function ClientHabits() {
  const qc = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const habitsQ = useQuery({ queryKey: ['wellness', 'habits'], queryFn: wellnessApi.listHabits });
  const [newTitle, setNewTitle] = useState('');
  const [newIcon, setNewIcon] = useState('🎯');

  const toggleMut = useMutation({
    mutationFn: (id: string) => wellnessApi.toggleHabit(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wellness', 'habits'] }),
    onError: () => toast.error('Could not update habit.'),
  });
  const addMut = useMutation({
    mutationFn: () => wellnessApi.createHabit({ title: newTitle.trim(), icon: newIcon }),
    onSuccess: () => { setNewTitle(''); qc.invalidateQueries({ queryKey: ['wellness', 'habits'] }); },
    onError: () => toast.error('Could not add habit.'),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => wellnessApi.deleteHabit(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wellness', 'habits'] }),
  });

  const habits = habitsQ.data ?? [];

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <div className="mx-auto w-full max-w-2xl px-5 py-6">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-5">
          <motion.div variants={fadeUp}>
            <div className="flex items-center gap-2 text-violet-600 dark:text-violet-300">
              <Repeat className="h-4 w-4" />
              <span className="text-xs uppercase tracking-[0.18em]">Habits</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Build your streaks</h1>
            <p className="mt-1 text-sm text-foreground/60">Tap to check off today. Consistency beats intensity.</p>
          </motion.div>

          {/* Add habit */}
          <motion.div variants={fadeUp}>
            <Glass className="flex items-center gap-2 p-3">
              <input
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value.slice(0, 2))}
                className="h-10 w-12 rounded-xl border border-foreground/10 bg-foreground/[0.03] text-center text-lg focus:outline-none"
                aria-label="Habit icon"
              />
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newTitle.trim()) addMut.mutate(); }}
                placeholder="New habit — e.g. Drink 2L water"
                className="h-10 flex-1 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-violet-400/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => newTitle.trim() && addMut.mutate()}
                disabled={!newTitle.trim() || addMut.isPending}
                className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white disabled:opacity-40"
              >
                {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </button>
            </Glass>
          </motion.div>

          {/* Habit list */}
          {habitsQ.isLoading ? (
            <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
          ) : habits.length === 0 ? (
            <motion.div variants={fadeUp}>
              <Glass className="p-8 text-center">
                <Repeat className="mx-auto h-8 w-8 text-foreground/25" />
                <div className="mt-3 text-sm text-foreground/70">No habits yet</div>
                <div className="mt-1 text-xs text-foreground/50">Add your first habit above to start a streak.</div>
              </Glass>
            </motion.div>
          ) : (
            <motion.div variants={fadeUp} className="space-y-2.5">
              {habits.map((h) => (
                <HabitCard key={h.id} habit={h} onToggle={() => toggleMut.mutate(h.id)} onDelete={() => delMut.mutate(h.id)} busy={toggleMut.isPending} />
              ))}
            </motion.div>
          )}
        </motion.div>
      </div>
    </ClientLayout>
  );
}

function HabitCard({ habit, onToggle, onDelete, busy }: { habit: Habit; onToggle: () => void; onDelete: () => void; busy: boolean }) {
  return (
    <Glass className="group flex items-center gap-3 p-3.5">
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        className={cn(
          'grid h-11 w-11 flex-shrink-0 place-items-center rounded-full border-2 text-lg transition-all',
          habit.done_today
            ? 'border-emerald-400 bg-emerald-400/15 text-emerald-600 dark:text-emerald-300'
            : 'border-foreground/15 hover:border-violet-400/50',
        )}
      >
        {habit.done_today ? <Check className="h-5 w-5" /> : <span>{habit.icon ?? '○'}</span>}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{habit.title}</span>
          {habit.streak > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-300">
              <Flame className="h-3 w-3" /> {habit.streak}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          {habit.last7.map((d, i) => (
            <span key={d.date} className="flex flex-col items-center gap-0.5">
              <span className={cn('h-2 w-2 rounded-full', d.done ? 'bg-emerald-400' : 'bg-foreground/10')} />
              <span className="text-[8px] text-foreground/35">{DOW[new Date(d.date).getDay()]}{i === 6 ? '' : ''}</span>
            </span>
          ))}
        </div>
      </div>

      <button type="button" onClick={onDelete} className="opacity-0 transition-opacity group-hover:opacity-100">
        <Trash2 className="h-4 w-4 text-foreground/30 hover:text-rose-500" />
      </button>
    </Glass>
  );
}
