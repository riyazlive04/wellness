import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Flame, Check, Plus, Trash2, Loader2, Repeat, Target, CalendarCheck, Trophy } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { wellnessApi, type Habit } from '@/modules/wellness/api';
import { cn } from '@/lib/utils';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Produce the locally-predicted habit after a check-in toggle, so the UI can
 * update instantly (optimistic) before the server confirms. The next refetch
 * reconciles the exact streak/last7 from the server.
 */
function optimisticToggle(h: Habit): Habit {
  const nowDone = !h.done_today;
  const last7 = h.last7 ? [...h.last7] : [];
  if (last7.length) last7[last7.length - 1] = { ...last7[last7.length - 1], done: nowDone };
  return {
    ...h,
    done_today: nowDone,
    streak: Math.max(0, (h.streak ?? 0) + (nowDone ? 1 : -1)),
    last7,
  };
}

export default function ClientHabits() {
  const qc = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const habitsQ = useQuery({ queryKey: ['wellness', 'habits'], queryFn: wellnessApi.listHabits });
  const [newTitle, setNewTitle] = useState('');
  const [newIcon, setNewIcon] = useState('🎯');

  const toggleMut = useMutation({
    mutationFn: (id: string) => wellnessApi.toggleHabit(id),
    // Optimistic: flip the card instantly, then reconcile on settle.
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ['wellness', 'habits'] });
      const prev = qc.getQueryData<Habit[]>(['wellness', 'habits']);
      qc.setQueryData<Habit[]>(['wellness', 'habits'], (old) =>
        old?.map((h) => (h.id === id ? optimisticToggle(h) : h)),
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['wellness', 'habits'], ctx.prev);
      toast.error('Could not update habit.');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['wellness', 'habits'] }),
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

  // ── Derived summary stats ────────────────────────────────────────────
  const active = habits.length;
  const completedToday = habits.filter((h) => h.done_today).length;
  const longestStreak = habits.reduce((max, h) => Math.max(max, h.streak ?? 0), 0);
  const completionPct = active > 0 ? Math.round((completedToday / active) * 100) : 0;

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <div className="mx-auto w-full max-w-5xl space-y-7 px-5 py-8 md:px-8 md:py-10">
        <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-7">
          {/* ── Header ──────────────────────────────────────────────── */}
          <motion.div variants={fadeUp}>
            <div className="flex items-center gap-2 text-violet-600 dark:text-violet-300">
              <Repeat className="h-4 w-4" />
              <span className="text-xs uppercase tracking-[0.18em]">Habits</span>
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Build your streaks</h1>
            <p className="mt-1.5 text-sm text-foreground/60">Tap to check off today. Consistency beats intensity.</p>
          </motion.div>

          {/* ── Stat strip ──────────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile icon={Target} label="Active" value={String(active)} tint="text-violet-600 dark:text-violet-300" />
            <StatTile icon={Flame} label="Longest streak" value={longestStreak > 0 ? `${longestStreak}d` : '—'} tint="text-orange-600 dark:text-orange-300" />
            <StatTile icon={CalendarCheck} label="Done today" value={`${completedToday}/${active || 0}`} tint="text-emerald-600 dark:text-emerald-300" />
            <StatTile icon={Trophy} label="Completion" value={`${completionPct}%`} tint="text-blue-600 dark:text-blue-300" />
          </motion.div>

          {/* ── Add habit ───────────────────────────────────────────── */}
          <motion.div variants={fadeUp}>
            <Glass className="flex items-center gap-2 p-3">
              <input
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value.slice(0, 2))}
                className="h-11 w-12 rounded-xl border border-foreground/10 bg-foreground/[0.03] text-center text-lg focus:outline-none"
                aria-label="Habit icon"
              />
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newTitle.trim()) addMut.mutate(); }}
                placeholder="New habit — e.g. Drink 2L water"
                className="h-11 flex-1 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-violet-400/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => newTitle.trim() && addMut.mutate()}
                disabled={!newTitle.trim() || addMut.isPending}
                className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white disabled:opacity-40"
              >
                {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </button>
            </Glass>
          </motion.div>

          {/* ── Habit grid ──────────────────────────────────────────── */}
          {habitsQ.isLoading ? (
            <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
          ) : habits.length === 0 ? (
            <motion.div variants={fadeUp}>
              <Glass className="flex flex-col items-center px-5 py-16 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.20)] to-[hsl(var(--brand-magenta)_/_0.15)] text-violet-600 dark:text-violet-300">
                  <Repeat className="h-6 w-6" />
                </div>
                <div className="mt-4 text-sm font-medium text-foreground/80">No habits yet</div>
                <div className="mt-1 max-w-xs text-xs text-foreground/50">Small, repeatable actions compound. Add your first habit above to start a streak.</div>
                <button
                  type="button"
                  onClick={() => document.querySelector<HTMLInputElement>('input[placeholder^="New habit"]')?.focus()}
                  className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02]"
                >
                  <Plus className="h-3.5 w-3.5" /> Add your first habit
                </button>
              </Glass>
            </motion.div>
          ) : (
            <motion.div variants={fadeUp} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {habits.map((h) => (
                <HabitCard key={h.id} habit={h} onToggle={() => toggleMut.mutate(h.id)} onDelete={() => delMut.mutate(h.id)} />
              ))}
            </motion.div>
          )}
        </motion.div>
      </div>
    </ClientLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// StatTile — Glass summary stat.
// ─────────────────────────────────────────────────────────────────────────

function StatTile({ icon: Icon, label, value, tint }: { icon: typeof Target; label: string; value: string; tint: string }) {
  return (
    <Glass className="p-4">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-3.5 w-3.5', tint)} strokeWidth={1.8} />
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// HabitCard — ring check-in card with streak + 7-day trail.
// ─────────────────────────────────────────────────────────────────────────

function HabitCard({ habit, onToggle, onDelete }: { habit: Habit; onToggle: () => void; onDelete: () => void }) {
  const last7 = habit.last7 ?? [];
  const doneCount = last7.filter((d) => d.done).length;
  const pct = last7.length > 0 ? (doneCount / last7.length) * 100 : 0;
  const radius = 22;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (Math.max(0, Math.min(100, pct)) / 100) * circ;

  return (
    <Glass
      className={cn(
        'group relative flex flex-col overflow-hidden p-5 transition-colors',
        habit.done_today ? 'border-emerald-400/30 bg-emerald-400/[0.04]' : 'hover:bg-foreground/[0.03]',
      )}
    >
      <button
        type="button"
        onClick={onDelete}
        className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Delete habit"
      >
        <Trash2 className="h-4 w-4 text-foreground/30 hover:text-rose-500" />
      </button>

      {/* Ring check-in */}
      <button
        type="button"
        onClick={onToggle}
        className="relative mx-auto grid h-16 w-16 place-items-center transition-transform hover:scale-105 active:scale-95"
        aria-label={habit.done_today ? 'Mark not done' : 'Check off today'}
      >
        <svg viewBox="0 0 56 56" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="28" cy="28" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-foreground/[0.08]" />
          <circle
            cx="28" cy="28" r={radius} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            className={cn('transition-all duration-500', habit.done_today ? 'text-emerald-500' : pct > 0 ? 'text-violet-500' : 'text-foreground/20')}
          />
        </svg>
        <span
          className={cn(
            'grid h-11 w-11 place-items-center rounded-full text-lg transition-colors',
            habit.done_today ? 'bg-emerald-400/15 text-emerald-600 dark:text-emerald-300' : 'bg-foreground/[0.04]',
          )}
        >
          {/* Keyed on done state so the icon pops in on each check-in. */}
          <motion.span
            key={habit.done_today ? 'done' : 'todo'}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 22 }}
            className="grid place-items-center"
          >
            {habit.done_today ? <Check className="h-5 w-5" /> : <span>{habit.icon ?? '○'}</span>}
          </motion.span>
        </span>
      </button>

      {/* Title + streak */}
      <div className="mt-4 text-center">
        <div className="truncate text-sm font-medium">{habit.title}</div>
        {habit.streak > 0 ? (
          // Keyed on streak so the badge pops each time the count changes.
          <motion.span
            key={habit.streak}
            initial={{ scale: 0.6 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 480, damping: 17 }}
            className="mt-1.5 inline-flex items-center gap-0.5 rounded-full bg-orange-400/15 px-2 py-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-300"
          >
            <Flame className="h-3 w-3" /> {habit.streak} day{habit.streak === 1 ? '' : 's'}
          </motion.span>
        ) : (
          <span className="mt-1.5 inline-block text-[10px] uppercase tracking-[0.16em] text-foreground/40">No streak yet</span>
        )}
      </div>

      {/* 7-day trail */}
      <div className="mt-auto flex items-end justify-center gap-1.5 pt-4">
        {last7.map((d, i) => (
          <span key={d.date} className="flex flex-col items-center gap-1">
            <span className={cn('h-2.5 w-2.5 rounded-full', d.done ? 'bg-emerald-400' : 'bg-foreground/10')} />
            <span className="text-[8px] text-foreground/35">{DOW[new Date(d.date).getDay()]}{i === 6 ? '' : ''}</span>
          </span>
        ))}
      </div>
    </Glass>
  );
}
