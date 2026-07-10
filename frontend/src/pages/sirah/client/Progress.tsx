import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplet, Moon, Flame, Scale, Plus, Trophy, Flag, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type HabitDay, type Milestone } from '@/modules/workspace/api/clients';
import { AssessmentPanel } from '@/modules/client/AssessmentPanel';
import { cn } from '@/lib/utils';

// The full milestone catalog — mirrors the backend thresholds in
// recomputeMilestones(). Each threshold shows as earned or locked.
const MILESTONE_CATALOG: Array<{ kind: string; label: string; unit: string; icon: LucideIcon; values: number[] }> = [
  { kind: 'weight_lost_kg', label: 'Weight lost',    unit: 'kg',   icon: Scale, values: [1, 2, 5, 10, 15, 20] },
  { kind: 'streak_days',    label: 'Logging streak', unit: 'days', icon: Flame, values: [3, 7, 14, 30, 60, 100] },
  { kind: 'waist_lost_in',  label: 'Waist lost',     unit: 'in',   icon: Flag,  values: [1, 2, 4, 6] },
];

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
  const milestonesQ = useQuery({
    queryKey: ['me', 'milestones'],
    queryFn: () => clientsApi.myMilestones(),
    retry: 1,
  });

  const habits = habitsQ.data ?? [];
  const today = habits[0]; // backend should return newest-first
  const achievements = achievementsQ.data ?? [];
  const earned = achievements.filter((a) => a.earned_at).length;
  const milestones = milestonesQ.data ?? [];
  // Map "<kind>:<value>" → the earned milestone, so the catalog can show earned/locked.
  const earnedMilestones = new Map(milestones.map((m) => [`${m.kind}:${m.value}`, m] as const));

  // In-app value prompt (replaces the native window.prompt for weight / sleep).
  const [askValue, setAskValue] = useState<null | {
    field: 'weight_kg' | 'sleep_hours';
    title: string;
    unit: string;
    placeholder: string;
    icon: LucideIcon;
    max: number;
  }>(null);

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
                <div className="text-[10px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
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
            onLog={() => setAskValue({ field: 'weight_kg', title: 'Log your weight', unit: 'kg', placeholder: 'e.g. 72.5', icon: Scale, max: 500 })}
            accent="from-emerald-400 to-teal-500"
          />
          <QuickLog
            icon={Moon}
            label="Sleep"
            display={today?.sleep_hours != null ? `${today.sleep_hours}h` : '—'}
            buttonLabel="Log"
            onLog={() => setAskValue({ field: 'sleep_hours', title: 'Hours of sleep last night', unit: 'hours', placeholder: 'e.g. 7.5', icon: Moon, max: 24 })}
            accent="from-teal-500 to-teal-500"
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

        {/* Body assessment — BMI / BMR / TDEE / measurements */}
        <motion.div variants={fadeUp} className="mt-6">
          <AssessmentPanel />
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

        {/* Milestones — the full catalog, shown as earned or locked */}
        <motion.div variants={fadeUp} className="mt-6">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-base font-semibold">Milestones</h2>
            <span className="text-xs text-foreground/55">{milestones.length} unlocked</span>
          </div>
          <div className="space-y-5">
            {MILESTONE_CATALOG.map((group) => (
              <div key={group.kind}>
                <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-foreground/50">
                  <group.icon className="h-3.5 w-3.5" /> {group.label}
                </div>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {group.values.map((v) => {
                    const m = earnedMilestones.get(`${group.kind}:${v}`);
                    const unlocked = !!m;
                    return (
                      <Glass
                        key={v}
                        className={cn(
                          'flex flex-col items-center gap-1.5 p-3 text-center transition-opacity',
                          !unlocked && 'opacity-45',
                        )}
                      >
                        <div className={cn(
                          'grid h-9 w-9 place-items-center rounded-full',
                          unlocked ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300' : 'bg-foreground/[0.05] text-foreground/40',
                        )}>
                          {unlocked ? <Trophy className="h-4 w-4" /> : <group.icon className="h-4 w-4" />}
                        </div>
                        <div className="text-sm font-semibold tabular-nums">{v} {group.unit}</div>
                        <div className="text-[10px] text-foreground/50">
                          {m ? new Date(m.achieved_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Locked'}
                        </div>
                      </Glass>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {askValue && (
          <ValuePromptModal
            config={askValue}
            onSubmit={(value) => logMut.mutate({ [askValue.field]: value } as Partial<HabitDay>)}
            onClose={() => setAskValue(null)}
          />
        )}
      </AnimatePresence>
    </ClientLayout>
  );
}

// ──────────────────────────────────────────────────────────────────

/**
 * In-app numeric prompt — a styled replacement for window.prompt for logging
 * weight / sleep. Validates the value and submits on Enter or Save.
 */
function ValuePromptModal({
  config, onSubmit, onClose,
}: {
  config: { title: string; unit: string; placeholder: string; icon: LucideIcon; max: number };
  onSubmit: (value: number) => void;
  onClose: () => void;
}) {
  const [val, setVal] = useState('');
  const num = Number(val);
  const valid = val.trim() !== '' && Number.isFinite(num) && num > 0 && num <= config.max;
  const Icon = config.icon;

  function submit() {
    if (valid) { onSubmit(Math.round(num * 100) / 100); onClose(); }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs overflow-hidden rounded-2xl border border-foreground/[0.08] bg-popover shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-foreground/[0.06] px-5 py-4">
          <Icon className="h-4 w-4 text-teal-600 dark:text-teal-300" />
          <span className="text-sm font-semibold">{config.title}</span>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 focus-within:border-teal-400/60">
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder={config.placeholder}
              className="h-11 flex-1 bg-transparent text-sm outline-none"
            />
            <span className="text-xs font-medium text-foreground/45">{config.unit}</span>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/70 hover:bg-foreground/[0.04]">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!valid}
              className="rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

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
        Log your weight to start tracking your trend.
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
          <stop offset="0%" stopColor="rgb(14 154 168)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="rgb(14 154 168)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L ${W} ${H} L 0 ${H} Z`} fill="url(#weightGrad)" />
      <path d={path} fill="none" stroke="rgb(14 154 168)" strokeWidth={2} strokeLinecap="round" />
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
  // Fixed 14-day window (oldest → newest) so the chart always shows 14 slots,
  // even with sparse history — missing days render as faint baseline ticks.
  const byDate = new Map(data.map((d) => [d.date, valueOf(d)]));
  const days: Array<{ date: string; value: number; today: boolean }> = [];
  const base = new Date();
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(base);
    dt.setDate(dt.getDate() - i);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    days.push({ date: iso, value: byDate.get(iso) ?? 0, today: i === 0 });
  }
  const todayVal = days[days.length - 1].value;
  const loggedCount = days.filter((d) => d.value > 0).length;

  return (
    <Glass className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className={cn('grid h-6 w-6 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white', accent)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="text-sm font-semibold">{label}</div>
        <div className="ml-auto text-xs tabular-nums text-foreground/55">
          <span className="font-semibold text-foreground/80">{todayVal}{unit}</span> today
        </div>
      </div>
      <div className="flex h-16 items-end gap-[3px]">
        {days.map((d, i) => {
          const has = d.value > 0;
          const pct = has ? Math.max(8, Math.min(100, (d.value / max) * 100)) : 0;
          return (
            <div
              key={i}
              className="flex h-full flex-1 flex-col justify-end"
              title={`${d.date}: ${d.value}${unit}`}
            >
              {has ? (
                <div
                  className={cn('rounded-[3px] bg-gradient-to-t transition-all', accent, d.today && 'ring-1 ring-inset ring-white/50')}
                  style={{ height: `${pct}%` }}
                />
              ) : (
                <div className={cn('h-[3px] rounded-full', d.today ? 'bg-foreground/25' : 'bg-foreground/[0.08]')} />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-foreground/45">
        <span>14 days ago</span>
        <span className="tabular-nums">{loggedCount}/14 logged</span>
        <span>today</span>
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