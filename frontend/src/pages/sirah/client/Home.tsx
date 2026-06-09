import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Camera,
  Mic,
  Droplet,
  Moon,
  Flame,
  ChevronRight,
  Sparkles,
  MessageCircle,
  Calendar,
  Utensils,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { ProgressRing } from '@/modules/client/components/ProgressRing';
import {
  FestivalRibbon, WeeklySummaryCard, MilestoneCelebration,
} from '@/modules/client/components/HomeWaveOneInserts';
import { clientsApi } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Client Home — the daily wellness companion landing.
 *
 * Information hierarchy:
 *   1. Big calming greeting + wellness score ring (hero)
 *   2. AI coach card (one focused suggestion for *today*)
 *   3. Today's meals strip
 *   4. Habit rings (water · sleep · exercise)
 *   5. Quick actions (Plate Vision · Voice AI · Chat)
 *   6. Program progress (if assigned)
 *   7. Upcoming nudge from nutritionist
 *
 * Layout: bento on desktop, vertical stack on mobile.
 */
export default function ClientHome() {
  const profileQ = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => clientsApi.myProfile(),
    staleTime: 60_000,
    retry: 1,
  });
  const snapshotQ = useQuery({
    queryKey: ['me', 'wellness', 'snapshot'],
    queryFn: () => clientsApi.myWellnessSnapshot(),
    retry: 1,
    // It's fine if the backend hasn't shipped this yet — we'll synthesize
    // sensible defaults below so the page still renders.
  });
  const mealsQ = useQuery({
    queryKey: ['me', 'meals', 1],
    queryFn: () => clientsApi.myMeals(1),
    staleTime: 30_000,
    retry: 1,
  });
  const programQ = useQuery({
    queryKey: ['me', 'program'],
    queryFn: () => clientsApi.myProgram(),
    staleTime: 60_000,
    retry: 1,
  });
  const messagesQ = useQuery({
    queryKey: ['me', 'messages'],
    queryFn: () => clientsApi.myMessages(5),
    staleTime: 30_000,
    retry: 1,
  });

  const profile = profileQ.data;
  const firstName = profile?.name?.split(' ')[0] ?? 'there';

  // Snapshot data with fallbacks if backend endpoint isn't shipped yet
  const snap = snapshotQ.data ?? {
    score: 72,
    scoreLabel: 'On track',
    streakDays: 0,
    todayKcal: (mealsQ.data ?? []).reduce((s, m) => s + (m.kcal ?? 0), 0),
    targetKcal: profile?.target_kcal ?? 1800,
    waterMl: 0,
    waterTargetMl: 2500,
    sleepHours: null,
    exerciseMinutes: 0,
    habitsCompletedToday: 0,
    habitsTotal: 3,
  };

  const meals = mealsQ.data ?? [];
  const program = programQ.data;
  const latestNudge = (messagesQ.data ?? []).find((m) => m.sender_type !== 'client');

  return (
    <ClientLayout firstName={firstName}>
      <MilestoneCelebration />
      <motion.div
        variants={stagger(0.08, 0.06)}
        initial="initial"
        animate="animate"
        className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10"
      >
        <FestivalRibbon />
        {/* Greeting + wellness score */}
        <motion.section
          variants={fadeUp}
          className="relative grid grid-cols-1 gap-6 md:grid-cols-[1.5fr_1fr]"
        >
          <div className="flex flex-col justify-center">
            <span className="hidden text-[11px] uppercase tracking-[0.20em] text-foreground/55 md:block">
              {greetingTime()} · Your wellness
            </span>
            <h1 className="mt-1 text-3xl font-semibold leading-tight md:text-4xl">
              Hi {firstName}.{' '}
              <span className="bg-gradient-to-r from-blue-500 to-fuchsia-500 bg-clip-text text-transparent">
                {snap.scoreLabel}
              </span>
              .
            </h1>
            <p className="mt-2 max-w-md text-sm text-foreground/65 md:text-base">
              {snap.streakDays > 0
                ? `${snap.streakDays}-day streak. Keep going — small steps stack.`
                : 'Start a streak today. One meal logged is enough.'}
            </p>
          </div>

          <div className="flex justify-center md:justify-end">
            <Glass variant="heavy" className="flex w-full max-w-xs flex-col items-center p-6">
              <ProgressRing value={snap.score} size={140} stroke={10}>
                <div className="text-center">
                  <div className="text-3xl font-semibold">{snap.score}</div>
                  <div className="text-[9px] uppercase tracking-[0.18em] text-foreground/55">
                    Wellness
                  </div>
                </div>
              </ProgressRing>
              <div className="mt-3 text-xs text-foreground/65">{snap.scoreLabel}</div>
            </Glass>
          </div>
        </motion.section>

        {/* AI weekly summary */}
        <motion.section variants={fadeUp} className="mt-6">
          <WeeklySummaryCard />
        </motion.section>

        {/* AI coach focal card */}
        <motion.section variants={fadeUp} className="mt-6">
          <AIGlow intensity="medium" animated>
            <Glass variant="heavy" className="p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-500/30 to-fuchsia-500/20">
                  <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-200" />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
                    AI Coach · Today
                  </div>
                  <p className="mt-1 text-base font-medium text-foreground">
                    {buildCoachLine(snap, meals.length)}
                  </p>
                  <p className="mt-1 text-sm text-foreground/65">
                    Tap to chat through it with SIRAH — voice or text, your call.
                  </p>
                </div>
                <Link
                  to="/portal/voice"
                  className="hidden flex-shrink-0 items-center gap-1 rounded-full bg-foreground/[0.06] px-3 py-1.5 text-xs text-foreground/75 transition-colors hover:bg-foreground/[0.10] sm:inline-flex"
                >
                  Talk to SIRAH
                  <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            </Glass>
          </AIGlow>
        </motion.section>

        {/* Habit rings */}
        <motion.section variants={fadeUp} className="mt-6 grid grid-cols-3 gap-3">
          <HabitTile
            icon={Droplet}
            label="Water"
            value={`${(snap.waterMl / 1000).toFixed(1)}L`}
            sub={`of ${(snap.waterTargetMl / 1000).toFixed(1)}L`}
            pct={Math.min(100, (snap.waterMl / snap.waterTargetMl) * 100)}
            accent="from-sky-400 to-blue-500"
          />
          <HabitTile
            icon={Moon}
            label="Sleep"
            value={snap.sleepHours != null ? `${snap.sleepHours}h` : '—'}
            sub="last night"
            pct={Math.min(100, ((snap.sleepHours ?? 0) / 8) * 100)}
            accent="from-indigo-500 to-violet-500"
          />
          <HabitTile
            icon={Flame}
            label="Move"
            value={`${snap.exerciseMinutes}m`}
            sub="today"
            pct={Math.min(100, (snap.exerciseMinutes / 30) * 100)}
            accent="from-orange-400 to-rose-500"
          />
        </motion.section>

        {/* Quick actions */}
        <motion.section variants={fadeUp} className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuickAction
            to="/portal/plate-vision"
            icon={Camera}
            title="Plate Vision"
            subtitle="Snap your meal — AI logs it"
            accent="from-amber-400/30 to-orange-500/20"
          />
          <QuickAction
            to="/portal/voice"
            icon={Mic}
            title="Voice AI"
            subtitle="Talk your way through the day"
            accent="from-violet-500/30 to-fuchsia-500/20"
          />
          <QuickAction
            to="/portal/chat"
            icon={MessageCircle}
            title="Chat"
            subtitle="Message your nutritionist"
            accent="from-emerald-400/30 to-teal-500/20"
          />
        </motion.section>

        {/* Today's meals */}
        <motion.section variants={fadeUp} className="mt-6">
          <SectionHeader title="Today's meals" linkTo="/portal/meals" linkLabel="View all" />
          <Glass className="p-4">
            {meals.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <Utensils className="h-6 w-6 text-foreground/35" />
                <div className="text-sm text-foreground/65">
                  No meals logged yet today. Snap your first one with Plate Vision.
                </div>
                <Link
                  to="/portal/plate-vision"
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-xs font-medium text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.5)]"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Open Plate Vision
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-foreground/[0.05]">
                {meals.map((m) => (
                  <li key={m.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-foreground/[0.05] text-[10px] uppercase tracking-[0.18em] text-foreground/55">
                        {m.meal_type.slice(0, 1)}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{m.meal_name ?? m.meal_type}</div>
                        <div className="text-xs text-foreground/55">
                          {new Date(m.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums">
                      {m.kcal ?? '—'}<span className="ml-0.5 text-[10px] font-normal text-foreground/55">kcal</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-foreground/[0.05] pt-3 text-xs">
              <span className="text-foreground/55">Today's total</span>
              <span className="font-semibold">
                {snap.todayKcal}{' '}
                <span className="font-normal text-foreground/55">
                  / {snap.targetKcal ?? '—'} kcal
                </span>
              </span>
            </div>
          </Glass>
        </motion.section>

        {/* Program progress */}
        {program && (
          <motion.section variants={fadeUp} className="mt-6">
            <SectionHeader title="Your program" linkTo="/portal/programs" linkLabel="Open" />
            <Glass className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
                    Week {program.week_number}
                  </div>
                  <div className="mt-1 text-base font-medium">
                    {program.status === 'active' ? 'In progress' : program.status}
                  </div>
                  <div className="mt-1 text-xs text-foreground/55">
                    {new Date(program.start_date).toLocaleDateString()} → {new Date(program.end_date).toLocaleDateString()}
                  </div>
                </div>
                <Trophy className="h-6 w-6 text-amber-500/85" />
              </div>
            </Glass>
          </motion.section>
        )}

        {/* Latest message from nutritionist */}
        {latestNudge && (
          <motion.section variants={fadeUp} className="mt-6">
            <SectionHeader title="From your nutritionist" linkTo="/portal/chat" linkLabel="Open chat" />
            <Glass className="p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400/40 to-teal-500/30 text-xs font-medium text-white">
                  N
                </div>
                <div className="flex-1">
                  <p className="text-sm text-foreground/85">{latestNudge.content}</p>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-foreground/55">
                    {new Date(latestNudge.created_at).toLocaleString([], {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            </Glass>
          </motion.section>
        )}

        {/* Upcoming appointment placeholder until the appointments page lands */}
        <motion.section variants={fadeUp} className="mt-6">
          <Glass className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-300">
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">No upcoming appointment</div>
                <div className="text-xs text-foreground/55">Book one when you're ready</div>
              </div>
            </div>
            <Link
              to="/portal/appointments"
              className="text-xs text-foreground/65 hover:text-foreground"
            >
              View
            </Link>
          </Glass>
        </motion.section>
      </motion.div>
    </ClientLayout>
  );
}

// ──────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────

function HabitTile({
  icon: Icon, label, value, sub, pct, accent,
}: { icon: LucideIcon; label: string; value: string; sub: string; pct: number; accent: string }) {
  return (
    <Glass className="flex flex-col items-center gap-2 p-4 text-center">
      <div className={cn('grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br', accent)}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="text-base font-semibold leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-foreground/[0.05]">
        <div
          className={cn('h-full rounded-full bg-gradient-to-r', accent)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-[10px] text-foreground/45">{sub}</div>
    </Glass>
  );
}

function QuickAction({
  to, icon: Icon, title, subtitle, accent,
}: { to: string; icon: LucideIcon; title: string; subtitle: string; accent: string }) {
  return (
    <Link to={to} className="group">
      <Glass className="flex h-full items-center gap-3 p-4 transition-transform group-hover:scale-[1.02]">
        <div className={cn('grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br', accent)}>
          <Icon className="h-5 w-5 text-foreground" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-foreground/55">{subtitle}</div>
        </div>
        <ChevronRight className="h-4 w-4 text-foreground/35 transition-transform group-hover:translate-x-0.5" />
      </Glass>
    </Link>
  );
}

function SectionHeader({
  title, linkTo, linkLabel,
}: { title: string; linkTo: string; linkLabel: string }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <h2 className="text-base font-semibold">{title}</h2>
      <Link to={linkTo} className="text-xs text-foreground/65 hover:text-foreground">
        {linkLabel}
      </Link>
    </div>
  );
}

function greetingTime(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Wind down';
}

function buildCoachLine(snap: { todayKcal: number; targetKcal: number | null; waterMl: number; waterTargetMl: number; exerciseMinutes: number }, mealCount: number): string {
  if (snap.targetKcal && snap.todayKcal < snap.targetKcal * 0.3 && mealCount === 0) {
    return 'You haven\'t logged a meal yet today. Start with a quick Plate Vision capture.';
  }
  if (snap.waterMl < snap.waterTargetMl * 0.4) {
    return `You're at ${(snap.waterMl / 1000).toFixed(1)}L of water. Try to get to ${(snap.waterTargetMl / 1000).toFixed(1)}L by evening.`;
  }
  if (snap.exerciseMinutes === 0) {
    return 'A 10-minute walk would do wonders right now. Bonus: log it via Voice AI.';
  }
  return 'You\'re tracking well. Keep the rhythm going.';
}