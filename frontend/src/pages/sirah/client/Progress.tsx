import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Droplet, Moon, Flame, Scale, Plus, Trophy, Flag } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type HabitDay } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

export default function ClientProgress() {
  const queryClient = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const habitsQ = useQuery({
    queryKey: ['me', 'habits', 14],
    queryFn: () => clientsApi.myHabits(14),
    retry: 1,
  });
  const achievementsQ = useQuery({
    queryKey: ['me', 'achievements'],
    queryFn: () => clientsApi.myAchievements(),
    retry: 1,
  });

  const habits = habitsQ.data ?? [];
  const today = habits[0]; // backend should return newest-first
  const achievements = achievementsQ.data ?? [];
  const earned = achievements.filter((a) => a.earned_at).length;

  const logMut = useMutation({
    mutationFn: (body: Partial<HabitDay>) => clientsApi.logHabit(body),
    onSuccess: () => {
      toast.success('Logged');
      queryClient.invalidateQueries({ queryKey: ['me', 'habits'] });
      queryClient.invalidateQueries({ queryKey: ['me', 'wellness', 'snapshot'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not save.'),
  });

  // Streak — count consecutive days back from today where at least one habit was logged
  const streak = computeStreak(habits);
  const todayWater = today?.water_ml ?? 0;
  const todayWeight = today?.weight_kg ?? null;

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10"
      >
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Insights · Progress</span>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Your story, two weeks back.</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65 md:text-base">
            How you've moved, slept, hydrated, and weighed in. Tap any tile to add today's data.
          </p>
        </motion.div>

        {/* Headline streak */}
        <motion.div variants={fadeUp} className="mt-6">
          <AIGlow intensity="soft" animated>
            <Glass variant="heavy" className="flex items-center justify-between p-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
                  Current streak
                </div>
                <div className="mt-1 text-3xl font-semibold">{streak} day{streak === 1 ? '' : 's'}</div>
                <div className="mt-1 text-xs text-foreground/65">
                  {streak > 0 ? 'Keep it going — log something today.' : 'Start fresh today.'}
                </div>
              </div>
              <Flag className="h-8 w-8 text-amber-500" />
            </Glass>
          </AIGlow>
        </motion.div>

        {/* Today's quick logs */}
        <motion.div variants={fadeUp} className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <QuickLog
            icon={Droplet}
            label="Water"
            display={`${(todayWater / 1000).toFixed(1)}L`}
            buttonLabel="+250ml"
            onLog={() => logMut.mutate({ water_ml: todayWater + 250 })}
            accent="from-sky-400 to-blue-500"
          />
          <QuickLog
            icon={Scale}
            label="Weight"
            display={todayWeight != null ? `${todayWeight}kg` : '—'}
            buttonLabel="Log"
            onLog={() => {
              const v = window.prompt('Weight in kg?');
              const num = v ? Number(v) : NaN;
              if (Number.isFinite(num) && num > 0) logMut.mutate({ weight_kg: num });
            }}
            accent="from-emerald-400 to-teal-500"
          />
          <QuickLog
            icon={Moon}
            label="Sleep"
            display={today?.sleep_hours != null ? `${today.sleep_hours}h` : '—'}
            buttonLabel="Log"
            onLog={() => {
              const v = window.prompt('Hours of sleep last night?');
              const num = v ? Number(v) : NaN;
              if (Number.isFinite(num) && num > 0) logMut.mutate({ sleep_hours: num });
            }}
            accent="from-indigo-500 to-violet-500"
          />
          <QuickLog
            icon={Flame}
            label="Move"
            display={`${today?.exercise_minutes ?? 0}m`}
            buttonLabel="+15m"
            onLog={() => logMut.mutate({ exercise_minutes: (today?.exercise_minutes ?? 0) + 15 })}
            accent="from-orange-400 to-rose-500"
          />
        </motion.div>

        {/* Weight chart */}
        <motion.div variants={fadeUp} className="mt-6">
          <h2 className="mb-3 text-base font-semibold">Weight</h2>
          <Glass className="p-5">
            <WeightChart data={habits} />
          </Glass>
        </motion.div>

        {/* Habit history bars */}
        <motion.div variants={fadeUp} className="mt-6">
          <h2 className="mb-3 text-base font-semibold">14-day rhythm</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <HabitBars
              icon={Droplet}
              label="Water"
              data={habits}
              valueOf={(d) => d.water_ml}
              max={3000}
              accent="from-sky-400 to-blue-500"
              unit="ml"
            />
            <HabitBars
              icon={Flame}
              label="Movement"
              data={habits}
              valueOf={(d) => d.exercise_minutes}
              max={60}
              accent="from-orange-400 to-rose-500"
              unit="m"
            />
          </div>
        </motion.div>

        {/* Achievements */}
        <motion.div variants={fadeUp} className="mt-6">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-base font-semibold">Achievements</h2>
            <span className="text-xs text-foreground/55">
              {earned} / {achievements.length} earned
            </span>
          </div>
          {achievements.length === 0 ? (
            <Glass className="p-5 text-center text-sm text-foreground/55">
              Badges show up as you build streaks. Log a meal to start.
            </Glass>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {achievements.map((a) => (
                <Glass
                  key={a.id}
                  className={cn(
                    'flex flex-col items-center gap-2 p-4 text-center transition-opacity',
                    !a.earned_at && 'opacity-40',
                  )}
                >
                  <div className="text-3xl">{a.icon}</div>
                  <div className="text-sm font-medium leading-tight">{a.title}</div>
                  <div className="text-[10px] text-foreground/55">{a.description}</div>
                  {!a.earned_at && a.progress > 0 && (
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-foreground/[0.05]">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-rose-500"
                        style={{ width: `${a.progress}%` }}
                      />
                    </div>
                  )}
                  {a.earned_at && <Trophy className="h-3 w-3 text-amber-500" />}
                </Glass>
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>
    </ClientLayout>
  );
}

// ──────────────────────────────────────────────────────────────────

function QuickLog({
  icon: Icon, label, display, buttonLabel, onLog, accent,
}: {
  icon: typeof Droplet; label: string; display: string;
  buttonLabel: string; onLog: () => void; accent: string;
}) {
  return (
    <Glass className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <div className={cn('grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br', accent)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</div>
      </div>
      <div className="text-2xl font-semibold tabular-nums">{display}</div>
      <button
        type="button"
        onClick={onLog}
        className="inline-flex items-center justify-center gap-1 rounded-full border border-foreground/10 px-3 py-1.5 text-xs hover:bg-foreground/[0.05]"
      >
        <Plus className="h-3 w-3" />
        {buttonLabel}
      </button>
    </Glass>
  );
}

function WeightChart({ data }: { data: HabitDay[] }) {
  // Reverse to oldest-first; drop nulls
  const points = [...data]
    .reverse()
    .filter((d) => d.weight_kg != null)
    .map((d) => ({ date: d.date, w: d.weight_kg as number }));

  if (points.length < 2) {
    return (
      <div className="py-6 text-center text-sm text-foreground/55">
        Log your weight a few times — chart appears once we have 2+ data points.
      </div>
    );
  }

  const min = Math.min(...points.map((p) => p.w));
  const max = Math.max(...points.map((p) => p.w));
  const range = Math.max(1, max - min);
  const W = 600;
  const H = 120;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * W;
      const y = H - ((p.w - min) / range) * H;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="weightGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(99 102 241)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="rgb(99 102 241)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L ${W} ${H} L 0 ${H} Z`} fill="url(#weightGrad)" />
      <path d={path} fill="none" stroke="rgb(99 102 241)" strokeWidth={2} strokeLinecap="round" />
      <text x={0} y={H + 15} className="fill-current text-[10px] text-foreground/55">{points[0].date}</text>
      <text x={W} y={H + 15} textAnchor="end" className="fill-current text-[10px] text-foreground/55">{points[points.length - 1].date}</text>
    </svg>
  );
}

function HabitBars({
  icon: Icon, label, data, valueOf, max, accent, unit,
}: {
  icon: typeof Droplet; label: string; data: HabitDay[];
  valueOf: (d: HabitDay) => number; max: number;
  accent: string; unit: string;
}) {
  const points = [...data].reverse();
  const todayVal = points.length > 0 ? valueOf(points[points.length - 1]) : 0;
  return (
    <Glass className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-foreground/65" />
        <div className="text-sm font-medium">{label}</div>
        <div className="ml-auto text-xs tabular-nums text-foreground/65">
          today {todayVal}{unit}
        </div>
      </div>
      <div className="flex h-16 items-end gap-1">
        {points.map((d, i) => {
          const v = valueOf(d);
          const pct = Math.min(100, (v / max) * 100);
          return (
            <div key={i} className="flex-1 rounded-t bg-foreground/[0.05]" style={{ height: '100%' }} title={`${d.date}: ${v}${unit}`}>
              <div
                className={cn('rounded-t bg-gradient-to-t', accent)}
                style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
              />
            </div>
          );
        })}
      </div>
    </Glass>
  );
}

function computeStreak(habits: HabitDay[]): number {
  if (habits.length === 0) return 0;
  let streak = 0;
  for (const d of habits) {
    const logged = d.water_ml > 0 || d.exercise_minutes > 0 || d.weight_kg != null || d.sleep_hours != null;
    if (!logged) break;
    streak++;
  }
  return streak;
}