import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Camera, Mic, MessageCircle, Calendar, Droplet, Moon, Activity, Smile,
  ArrowRight, Sparkles, Brain,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import {
  FestivalRibbon, MilestoneCelebration,
} from '@/modules/client/components/HomeWaveOneInserts';
import { clientsApi } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Modern minimalist client home.
 *
 * Design ethos:
 *   - One accent color (violet), used sparingly.
 *   - Empty states read as invitations, not absences.
 *   - One CTA per fold; hierarchy is greeting → today's focus → habits.
 *   - Numbers live inline with labels, not stacked in chrome.
 *   - Quiet typography, generous whitespace, no rainbow gradients.
 *
 * Order of importance (top to bottom):
 *   1. Festival ribbon (only when relevant)
 *   2. Greeting + day + tiny score
 *   3. The ONE action to take today
 *   4. Habit row — water / sleep / move / mood as tiny rings
 *   5. AI weekly summary
 *   6. Today's meals (when present) or hidden
 *   7. Quick actions strip
 *   8. From your nutritionist (when present)
 */
export default function ClientHome() {
  const qc = useQueryClient();
  const profileQ  = useQuery({ queryKey: ['me', 'profile'],    queryFn: () => clientsApi.myProfile(),          retry: 1 });
  const snapshotQ = useQuery({ queryKey: ['me', 'wellness', 'snapshot'], queryFn: () => clientsApi.myWellnessSnapshot(), retry: 1 });
  const mealsQ    = useQuery({ queryKey: ['me', 'meals', 1],   queryFn: () => clientsApi.myMeals(1),           retry: 1 });
  const programQ  = useQuery({ queryKey: ['me', 'program'],    queryFn: () => clientsApi.myProgram(),          retry: 1 });
  const messagesQ = useQuery({ queryKey: ['me', 'messages'],   queryFn: () => clientsApi.myMessages(5),        retry: 1 });
  const moodQ     = useQuery({ queryKey: ['me', 'mood', 1],    queryFn: () => clientsApi.moodHistory(1),       retry: 1 });
  const summaryQ  = useQuery({ queryKey: ['me', 'weekly-summary'], queryFn: () => clientsApi.weeklySummary(), retry: 1, staleTime: 12 * 60 * 60 * 1000 });

  const profile = profileQ.data;
  const firstName = profile?.name?.split(' ')[0] ?? '';
  const snap = snapshotQ.data;
  const meals = mealsQ.data ?? [];
  const program = programQ.data;
  const todayMood = moodQ.data?.[0]?.date === new Date().toISOString().slice(0, 10) ? moodQ.data[0] : null;
  const latestNudge = (messagesQ.data ?? []).find((m) => m.sender_type !== 'client');

  const focus = buildFocus(snap, meals.length, todayMood?.mood ?? null);

  const dayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <ClientLayout
      firstName={firstName || undefined}
      onRefresh={() => qc.invalidateQueries({ queryKey: ['me'] })}
    >
      <MilestoneCelebration />
      <motion.div
        variants={stagger(0.05, 0.04)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-3xl px-5 py-8 md:px-8 md:py-12"
      >
        <FestivalRibbon />

        {/* Greeting */}
        <motion.section variants={fadeUp} className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.22em] text-foreground/45">
              {greetingTime()}
            </div>
            <h1 className="mt-2 text-4xl font-medium tracking-tight md:text-[2.75rem]">
              Hi{firstName ? `, ${firstName}` : ''}.
            </h1>
            <div className="mt-1 text-sm text-foreground/55">{dayLabel}</div>
          </div>
          {snap && snap.score > 0 && (
            <div className="flex-shrink-0 text-right">
              <div className="text-3xl font-medium tabular-nums tracking-tight">{snap.score}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                {snap.scoreLabel}
              </div>
            </div>
          )}
        </motion.section>

        {/* Focus card — the ONE thing to do next */}
        <motion.section variants={fadeUp} className="mt-10">
          <div className="rounded-3xl border border-foreground/[0.07] bg-foreground/[0.015] p-6 transition-colors hover:bg-foreground/[0.03]">
            <div className="flex items-start gap-4">
              <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.20em] text-foreground/45">
                  {focus.label}
                </div>
                <p className="mt-1.5 text-base font-medium leading-snug md:text-lg">
                  {focus.text}
                </p>
                <Link
                  to={focus.to}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-violet-600 hover:gap-1.5 dark:text-violet-300"
                >
                  {focus.cta}
                  <ArrowRight className="h-3.5 w-3.5 transition-all" />
                </Link>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Habit row — minimal rings */}
        <motion.section variants={fadeUp} className="mt-10">
          <div className="grid grid-cols-4 gap-3 md:gap-4">
            <HabitMini
              icon={Droplet}
              label="Water"
              value={snap?.waterMl ? `${(snap.waterMl / 1000).toFixed(1)}L` : 'First sip?'}
              pct={snap ? (snap.waterMl / snap.waterTargetMl) * 100 : 0}
              to="/portal/progress"
            />
            <HabitMini
              icon={Moon}
              label="Sleep"
              value={snap?.sleepHours != null ? `${snap.sleepHours}h` : 'Log'}
              pct={snap?.sleepHours != null ? (snap.sleepHours / 8) * 100 : 0}
              to="/portal/progress"
            />
            <HabitMini
              icon={Activity}
              label="Move"
              value={snap?.exerciseMinutes ? `${snap.exerciseMinutes}m` : 'Start'}
              pct={snap ? (snap.exerciseMinutes / 30) * 100 : 0}
              to="/portal/progress"
            />
            <HabitMini
              icon={Smile}
              label="Mood"
              value={todayMood?.mood ? moodWord(todayMood.mood) : 'Tap'}
              pct={todayMood?.mood ? (todayMood.mood / 5) * 100 : 0}
              to="/portal/wellbeing"
            />
          </div>
        </motion.section>

        {/* AI weekly summary — quiet, no card chrome */}
        <motion.section variants={fadeUp} className="mt-10">
          <div className="flex items-start gap-3 border-t border-foreground/[0.06] pt-6">
            <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl bg-foreground/[0.04] text-foreground/65">
              <Brain className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-[0.20em] text-foreground/45">
                This week
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">
                {summaryQ.isLoading
                  ? 'Reading your week…'
                  : summaryQ.data?.summary ?? 'A few days of logging unlocks your first weekly summary.'}
              </p>
            </div>
          </div>
        </motion.section>

        {/* Today's meals — only render if there are any, otherwise focus card already nudges */}
        {meals.length > 0 && (
          <motion.section variants={fadeUp} className="mt-10">
            <SectionHeader title="Today" to="/portal/meals" label="All meals" />
            <ul className="divide-y divide-foreground/[0.05]">
              {meals.slice(0, 5).map((m) => (
                <li key={m.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {m.meal_name ?? m.meal_type}
                    </div>
                    <div className="text-[11px] text-foreground/45">
                      {new Date(m.logged_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                      <span className="ml-2 uppercase tracking-[0.12em]">{m.meal_type}</span>
                    </div>
                  </div>
                  <div className="text-sm font-medium tabular-nums">
                    {m.kcal ?? '—'}
                    <span className="ml-0.5 text-[10px] font-normal text-foreground/45">kcal</span>
                  </div>
                </li>
              ))}
            </ul>
            {snap?.targetKcal && (
              <div className="mt-2 flex items-center justify-between border-t border-foreground/[0.05] pt-3 text-xs">
                <span className="text-foreground/55">Today's total</span>
                <span className="font-medium tabular-nums">
                  {snap.todayKcal}
                  <span className="ml-1 font-normal text-foreground/45">/ {snap.targetKcal} kcal</span>
                </span>
              </div>
            )}
          </motion.section>
        )}

        {/* From your nutritionist — only when something exists */}
        {latestNudge && (
          <motion.section variants={fadeUp} className="mt-10">
            <SectionHeader title="From your nutritionist" to="/portal/chat" label="Open chat" />
            <div className="flex items-start gap-3 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] p-4">
              <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-emerald-500/15 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                N
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-relaxed text-foreground/85">{latestNudge.content}</p>
                <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                  {new Date(latestNudge.created_at).toLocaleString('en-IN', {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
                  })}
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {/* Program — single quiet line if active */}
        {program && (
          <motion.section variants={fadeUp} className="mt-10">
            <Link
              to="/portal/programs"
              className="flex items-center justify-between rounded-2xl border border-foreground/[0.06] bg-foreground/[0.015] px-4 py-3 transition-colors hover:bg-foreground/[0.04]"
            >
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                  Program · Week {program.week_number}
                </div>
                <div className="mt-0.5 text-sm font-medium">
                  {program.status === 'active' ? 'In progress' : program.status}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-foreground/35" />
            </Link>
          </motion.section>
        )}

        {/* Quick actions — slim chip row, no cards */}
        <motion.section variants={fadeUp} className="mt-10 border-t border-foreground/[0.06] pt-6">
          <div className="mb-3 text-[10px] uppercase tracking-[0.20em] text-foreground/45">
            Quick actions
          </div>
          <div className="-mx-1 flex flex-wrap gap-2">
            <Chip to="/portal/plate-vision" icon={Camera}        label="Plate Vision" />
            <Chip to="/portal/voice"        icon={Mic}           label="Voice AI" />
            <Chip to="/portal/chat"         icon={MessageCircle} label="Chat" />
            <Chip to="/portal/appointments" icon={Calendar}      label="Book appointment" />
          </div>
        </motion.section>
      </motion.div>
    </ClientLayout>
  );
}

// ──────────────────────────────────────────────────────────────────

function HabitMini({
  icon: Icon, label, value, pct, to,
}: {
  icon: typeof Droplet;
  label: string;
  value: string;
  pct: number;
  to: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const radius = 18;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (clamped / 100) * circ;
  return (
    <Link
      to={to}
      className="group flex flex-col items-center gap-2 rounded-2xl border border-foreground/[0.05] bg-foreground/[0.015] p-3 transition-colors hover:bg-foreground/[0.04]"
    >
      <div className="relative h-12 w-12">
        <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
          <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor"
                  strokeWidth="2.5" className="text-foreground/[0.07]" />
          <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                  className={cn(
                    'transition-all duration-500',
                    clamped > 0 ? 'text-violet-500' : 'text-foreground/20',
                  )} />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <Icon className="h-3.5 w-3.5 text-foreground/65" />
        </div>
      </div>
      <div className="text-center">
        <div className={cn(
          'text-xs font-medium tabular-nums',
          clamped === 0 && 'text-foreground/55',
        )}>
          {value}
        </div>
        <div className="text-[9px] uppercase tracking-[0.18em] text-foreground/45">{label}</div>
      </div>
    </Link>
  );
}

function Chip({ to, icon: Icon, label }: { to: string; icon: typeof Camera; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-full border border-foreground/[0.08] bg-foreground/[0.02] px-3.5 py-1.5 text-xs font-medium text-foreground/85 transition-colors hover:bg-foreground/[0.06]"
    >
      <Icon className="h-3.5 w-3.5 text-foreground/65" />
      {label}
    </Link>
  );
}

function SectionHeader({ title, to, label }: { title: string; to: string; label: string }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <Link to={to} className="text-[11px] text-foreground/55 hover:text-foreground">
        {label}
      </Link>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────

function greetingTime(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Wind down';
}

function moodWord(n: number): string {
  if (n >= 5) return 'Great';
  if (n >= 4) return 'Good';
  if (n >= 3) return 'Okay';
  if (n >= 2) return 'Meh';
  return 'Low';
}

interface Focus {
  label: string;
  text: string;
  cta: string;
  to: string;
}

/**
 * Pick the single most important next action for the day. Order of fallbacks:
 *   1. No mood logged → invite mood check-in (cheapest, fastest win).
 *   2. No meal logged + meal time → Plate Vision.
 *   3. Water far below target → drink water.
 *   4. No movement → suggest a walk.
 *   5. Default → general affirmation.
 */
function buildFocus(
  snap: { todayKcal: number; targetKcal: number | null; waterMl: number; waterTargetMl: number; exerciseMinutes: number; streakDays: number } | undefined,
  mealCount: number,
  todayMood: number | null,
): Focus {
  if (!snap) {
    return {
      label: 'Welcome',
      text: 'Let\'s start with one small action today.',
      cta: 'Take a photo of what you ate',
      to: '/portal/plate-vision',
    };
  }
  if (todayMood == null) {
    return {
      label: 'Take a moment',
      text: 'How are you feeling right now? One tap, then move on.',
      cta: 'Log mood',
      to: '/portal/wellbeing',
    };
  }
  if (mealCount === 0) {
    return {
      label: 'Today',
      text: 'Snap your first meal and let SIRAH do the calorie math.',
      cta: 'Open Plate Vision',
      to: '/portal/plate-vision',
    };
  }
  if (snap.waterMl < snap.waterTargetMl * 0.4) {
    return {
      label: 'Hydration',
      text: `${(snap.waterMl / 1000).toFixed(1)}L down, ${((snap.waterTargetMl - snap.waterMl) / 1000).toFixed(1)}L to go. One glass now?`,
      cta: 'Log water',
      to: '/portal/progress',
    };
  }
  if (snap.exerciseMinutes === 0) {
    return {
      label: 'Movement',
      text: 'A 10-minute walk would do wonders right now.',
      cta: 'Tell SIRAH about it',
      to: '/portal/voice',
    };
  }
  return {
    label: 'On track',
    text: snap.streakDays > 1
      ? `${snap.streakDays} days in a row. Quiet consistency wins.`
      : 'You\'re tracking well. Keep the rhythm going.',
    cta: 'See your progress',
    to: '/portal/progress',
  };
}