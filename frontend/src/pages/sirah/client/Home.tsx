import { useEffect, useState, type ComponentType } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Camera, Mic, MessageCircle, Calendar, Droplet, Moon, Activity, Smile,
  ArrowRight, Sparkles, Brain, Sun, Sunrise, Sunset, Utensils, ClipboardList,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import {
  FestivalRibbon, MilestoneCelebration,
} from '@/modules/client/components/HomeWaveOneInserts';
import { useWorkspaceBrand } from '@/lib/workspaceBrand';
import { clientsApi } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Client home — bento dashboard matching the owner Overview's polish:
 *   1. Branded gradient banner (practice logo + greeting + live clock + score)
 *   2. Focus card — the ONE action to take today
 *   3. Habit KPI tiles — water / sleep / move / mood as ring cards
 *   4. Today's nutrition — kcal progress + meals (inviting empty state)
 *   5. AI weekly summary
 *   6. From your nutritionist
 *   7. Program (when active)
 *   8. Quick actions grid
 *
 * Every figure comes from clientsApi; panels with no value show an honest,
 * inviting empty state rather than a blank gap.
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

  const { logoUrl, palette, practiceName } = useWorkspaceBrand();

  // Live ticking clock for the banner.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const profile = profileQ.data;
  const firstName = profile?.name?.split(' ')[0] ?? '';
  const snap = snapshotQ.data;
  const meals = mealsQ.data ?? [];
  const program = programQ.data;
  const todayMood = moodQ.data?.[0]?.date === new Date().toISOString().slice(0, 10) ? moodQ.data[0] : null;
  const latestNudge = (messagesQ.data ?? []).find((m) => m.sender_type !== 'client');

  const focus = buildFocus(snap, meals.length, todayMood?.mood ?? null);

  return (
    <ClientLayout
      firstName={firstName || undefined}
      onRefresh={() => qc.invalidateQueries({ queryKey: ['me'] })}
    >
      <MilestoneCelebration />
      <motion.div
        variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-5xl space-y-7 px-5 py-8 md:px-8 md:py-10"
      >
        <FestivalRibbon />

        {/* ── Branded banner ───────────────────────────────────────── */}
        <motion.div variants={fadeUp}>
          <ClientBanner
            firstName={firstName}
            practiceName={practiceName}
            logoUrl={logoUrl}
            primary={palette.primary}
            accent={palette.accent}
            now={now}
            score={snap && snap.score > 0 ? snap.score : null}
            scoreLabel={snap?.scoreLabel}
          />
        </motion.div>

        {/* ── Focus card — the ONE thing to do next ─────────────────── */}
        <motion.div variants={fadeUp}>
          <Glass className="relative overflow-hidden p-6">
            <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
            <div className="relative flex items-start gap-4">
              <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600/20 to-fuchsia-500/15 text-violet-600 dark:text-violet-300">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-[0.20em] text-foreground/45">{focus.label}</div>
                <p className="mt-1.5 text-lg font-medium leading-snug">{focus.text}</p>
                <Link
                  to={focus.to}
                  className="group mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02]"
                >
                  {focus.cta}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </Glass>
        </motion.div>

        {/* ── Habit KPI tiles ──────────────────────────────────────── */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HabitTile
            icon={Droplet} label="Water"
            value={snap?.waterMl ? `${(snap.waterMl / 1000).toFixed(1)}L` : '—'}
            pct={snap ? (snap.waterMl / snap.waterTargetMl) * 100 : 0}
            accent="blue" to="/portal/progress"
          />
          <HabitTile
            icon={Moon} label="Sleep"
            value={snap?.sleepHours != null ? `${snap.sleepHours}h` : '—'}
            pct={snap?.sleepHours != null ? (snap.sleepHours / 8) * 100 : 0}
            accent="violet" to="/portal/progress"
          />
          <HabitTile
            icon={Activity} label="Move"
            value={snap?.exerciseMinutes ? `${snap.exerciseMinutes}m` : '—'}
            pct={snap ? (snap.exerciseMinutes / 30) * 100 : 0}
            accent="emerald" to="/portal/progress"
          />
          <HabitTile
            icon={Smile} label="Mood"
            value={todayMood?.mood ? moodWord(todayMood.mood) : 'Tap'}
            pct={todayMood?.mood ? (todayMood.mood / 5) * 100 : 0}
            accent="amber" to="/portal/wellbeing"
          />
        </motion.div>

        {/* ── Nutrition + AI summary ───────────────────────────────── */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <NutritionCard
            meals={meals}
            todayKcal={snap?.todayKcal}
            targetKcal={snap?.targetKcal ?? null}
            loading={mealsQ.isLoading}
          />
          <InsightCard
            loading={summaryQ.isLoading}
            summary={summaryQ.data?.summary ?? null}
          />
        </motion.div>

        {/* ── From your nutritionist ───────────────────────────────── */}
        <motion.div variants={fadeUp}>
          <NutritionistCard nudge={latestNudge ?? null} loading={messagesQ.isLoading} />
        </motion.div>

        {/* ── Program (only when active) ───────────────────────────── */}
        {program && (
          <motion.div variants={fadeUp}>
            <Link to="/portal/programs">
              <Glass className="flex items-center justify-between p-5 transition-colors hover:bg-foreground/[0.04]">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                      Program · Week {program.week_number}
                    </div>
                    <div className="mt-0.5 text-sm font-medium capitalize">
                      {program.status === 'active' ? 'In progress' : program.status}
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-foreground/35" />
              </Glass>
            </Link>
          </motion.div>
        )}

        {/* ── Quick actions ────────────────────────────────────────── */}
        <motion.div variants={fadeUp}>
          <div className="mb-3 text-xs uppercase tracking-[0.18em] text-foreground/55">Quick actions</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <QuickActionCard to="/portal/plate-vision" icon={Camera}        label="Plate Vision" highlight />
            <QuickActionCard to="/portal/voice"        icon={Mic}           label="Voice AI" highlight />
            <QuickActionCard to="/portal/chat"         icon={MessageCircle} label="Chat" />
            <QuickActionCard to="/portal/appointments" icon={Calendar}      label="Book" />
          </div>
        </motion.div>
      </motion.div>
    </ClientLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ClientBanner — branded gradient hero with logo, greeting, clock, score.
// ─────────────────────────────────────────────────────────────────────────

function ClientBanner({
  firstName, practiceName, logoUrl, primary, accent, now, score, scoreLabel,
}: {
  firstName: string;
  practiceName: string;
  logoUrl: string | null;
  primary: string;
  accent: string;
  now: Date;
  score: number | null;
  scoreLabel?: string;
}) {
  const p = hex6(primary, '#7DBE9D');
  const a = hex6(accent, '#8087FF');

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-foreground/[0.06] p-6 md:p-8"
      style={{ background: `linear-gradient(135deg, ${p}22 0%, ${a}16 55%, transparent 100%)` }}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${a}33, transparent 70%)` }}
      />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div
            className="grid h-14 w-14 flex-shrink-0 place-items-center overflow-hidden rounded-2xl ring-1 ring-inset ring-white/30"
            style={{ background: `linear-gradient(135deg, ${p}, ${a})` }}
          >
            {logoUrl
              ? <img src={logoUrl} alt={practiceName} className="h-full w-full object-cover" />
              : <span className="text-base font-semibold text-white">{initialsOf(practiceName)}</span>}
          </div>
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-foreground/[0.08] bg-foreground/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/65">
              <GreetingIcon className="h-3.5 w-3.5 text-amber-500 dark:text-amber-300" />
              {greetingTime()}
            </span>
            <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              Hi{firstName ? `, ${firstName}` : ''}.
            </h1>
            <p className="mt-1.5 text-sm text-foreground/60">{formatDate(now)}</p>
          </div>
        </div>

        {/* Clock + wellness score */}
        <div className="flex flex-shrink-0 items-center gap-5 md:flex-col md:items-end md:gap-2">
          <div className="md:text-right">
            <div className="text-3xl font-semibold tabular-nums tracking-tight md:text-4xl">{formatTime(now)}</div>
          </div>
          {score != null ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/[0.08] px-3 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
              <Sparkles className="h-3 w-3" />
              {score} · {scoreLabel ?? 'Wellness'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-foreground/[0.08] bg-foreground/[0.04] px-3 py-1 text-[11px] text-foreground/55">
              Start logging to build your score
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// HabitTile — ring stat card.
// ─────────────────────────────────────────────────────────────────────────

type HabitAccent = 'blue' | 'violet' | 'emerald' | 'amber';
const HABIT_RING: Record<HabitAccent, string> = {
  blue: 'text-blue-500', violet: 'text-violet-500', emerald: 'text-emerald-500', amber: 'text-amber-500',
};

function HabitTile({
  icon: Icon, label, value, pct, accent, to,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string; value: string; pct: number; accent: HabitAccent; to: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const radius = 18;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (clamped / 100) * circ;
  return (
    <Link to={to} className="group">
      <Glass className="flex flex-col items-center p-4 transition-colors group-hover:bg-foreground/[0.04]">
        <div className="relative h-14 w-14">
          <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
            <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-foreground/[0.07]" />
            <circle
              cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={offset}
              className={cn('transition-all duration-500', clamped > 0 ? HABIT_RING[accent] : 'text-foreground/20')}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <Icon className="h-4 w-4 text-foreground/65" />
          </div>
        </div>
        <div className={cn('mt-2 text-sm font-semibold tabular-nums', clamped === 0 && 'text-foreground/55')}>{value}</div>
        <div className="text-[9px] uppercase tracking-[0.18em] text-foreground/45">{label}</div>
      </Glass>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// NutritionCard — today's kcal + meals, inviting empty state.
// ─────────────────────────────────────────────────────────────────────────

function NutritionCard({
  meals, todayKcal, targetKcal, loading,
}: {
  meals: Array<{ id: string; meal_name?: string | null; meal_type: string; logged_at: string; kcal?: number | null }>;
  todayKcal?: number;
  targetKcal: number | null;
  loading: boolean;
}) {
  const pct = targetKcal && todayKcal != null ? Math.min(100, (todayKcal / targetKcal) * 100) : 0;
  return (
    <Glass className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
        <div className="flex items-center gap-2">
          <Utensils className="h-4 w-4 text-violet-600 dark:text-violet-300" />
          <span className="text-sm font-medium">Today's nutrition</span>
        </div>
        <Link to="/portal/meals" className="text-[11px] text-foreground/55 hover:text-foreground">All meals</Link>
      </div>

      {targetKcal != null && (
        <div className="px-5 pt-4">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-foreground/55">Calories</span>
            <span className="font-medium tabular-nums">
              {todayKcal ?? 0}<span className="font-normal text-foreground/45"> / {targetKcal} kcal</span>
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
            <div className="h-full bg-gradient-to-r from-blue-500 to-fuchsia-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-10 text-sm text-foreground/50">Loading…</div>
      ) : meals.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-8 text-center">
          <Camera className="h-7 w-7 text-foreground/20" />
          <div className="mt-2 text-sm text-foreground/65">No meals logged today</div>
          <Link
            to="/portal/plate-vision"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3.5 py-1.5 text-xs font-medium text-foreground/85 hover:bg-foreground/[0.08]"
          >
            <Camera className="h-3.5 w-3.5" /> Snap a meal
          </Link>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-foreground/[0.04] px-5">
          {meals.slice(0, 5).map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.meal_name ?? m.meal_type}</div>
                <div className="text-[11px] text-foreground/45">
                  {new Date(m.logged_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                  <span className="ml-2 uppercase tracking-[0.12em]">{m.meal_type}</span>
                </div>
              </div>
              <div className="text-sm font-medium tabular-nums">
                {m.kcal ?? '—'}<span className="ml-0.5 text-[10px] font-normal text-foreground/45">kcal</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// InsightCard — AI weekly summary.
// ─────────────────────────────────────────────────────────────────────────

function InsightCard({ loading, summary }: { loading: boolean; summary: string | null }) {
  return (
    <Glass className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-foreground/[0.06] px-5 py-4">
        <Brain className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-300" />
        <span className="text-sm font-medium">This week with SIRAH</span>
      </div>
      <div className="flex-1 p-5">
        <p className="text-sm leading-relaxed text-foreground/85">
          {loading
            ? 'Reading your week…'
            : summary ?? 'A few days of logging unlocks your first AI weekly summary — keep going and SIRAH will spot the patterns for you.'}
        </p>
      </div>
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// NutritionistCard — latest nudge from the coach.
// ─────────────────────────────────────────────────────────────────────────

function NutritionistCard({
  nudge, loading,
}: {
  nudge: { content: string; created_at: string } | null;
  loading: boolean;
}) {
  return (
    <Glass className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
        <span className="text-sm font-medium">From your nutritionist</span>
        <Link to="/portal/chat" className="text-[11px] text-foreground/55 hover:text-foreground">Open chat</Link>
      </div>
      {loading ? (
        <div className="px-5 py-8 text-center text-sm text-foreground/50">Loading…</div>
      ) : !nudge ? (
        <div className="flex flex-col items-center px-5 py-8 text-center">
          <MessageCircle className="h-7 w-7 text-foreground/20" />
          <div className="mt-2 text-sm text-foreground/65">No messages yet</div>
          <div className="mt-1 text-[11px] text-foreground/45">Your nutritionist's notes will appear here.</div>
        </div>
      ) : (
        <div className="flex items-start gap-3 p-5">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-emerald-500/15 text-xs font-medium text-emerald-700 dark:text-emerald-300">N</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-relaxed text-foreground/85">{nudge.content}</p>
            <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
              {new Date(nudge.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
            </div>
          </div>
        </div>
      )}
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// QuickActionCard — Glass action tile (matches owner QuickAction).
// ─────────────────────────────────────────────────────────────────────────

function QuickActionCard({
  to, icon: Icon, label, highlight,
}: {
  to: string; icon: ComponentType<{ className?: string }>; label: string; highlight?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex items-center gap-3 rounded-xl border bg-foreground/[0.02] px-4 py-3 transition-all hover:-translate-y-px hover:bg-foreground/[0.05]',
        highlight ? 'border-violet-400/40' : 'border-foreground/[0.06]',
      )}
    >
      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-600/15 to-fuchsia-500/15 text-violet-700 transition-colors group-hover:from-violet-500/25 group-hover:to-emerald-400/25 dark:text-violet-300">
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium">{label}</span>
      {highlight && (
        <span className="ml-auto rounded-full bg-violet-400/15 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-violet-700 dark:text-violet-200">AI</span>
      )}
    </Link>
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

function GreetingIcon({ className }: { className?: string }) {
  const h = new Date().getHours();
  if (h < 5) return <Moon className={className} />;
  if (h < 12) return <Sunrise className={className} />;
  if (h < 17) return <Sun className={className} />;
  if (h < 21) return <Sunset className={className} />;
  return <Moon className={className} />;
}

function moodWord(n: number): string {
  if (n >= 5) return 'Great';
  if (n >= 4) return 'Good';
  if (n >= 3) return 'Okay';
  if (n >= 2) return 'Meh';
  return 'Low';
}

function initialsOf(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '–';
}

function hex6(c: string | undefined, fallback: string): string {
  if (!c || !/^#[0-9a-fA-F]{6}/.test(c)) return fallback;
  return c.slice(0, 7);
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
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
    return { label: 'Welcome', text: 'Let\'s start with one small action today.', cta: 'Take a photo of what you ate', to: '/portal/plate-vision' };
  }
  if (todayMood == null) {
    return { label: 'Take a moment', text: 'How are you feeling right now? One tap, then move on.', cta: 'Log mood', to: '/portal/wellbeing' };
  }
  if (mealCount === 0) {
    return { label: 'Today', text: 'Snap your first meal and let SIRAH do the calorie math.', cta: 'Open Plate Vision', to: '/portal/plate-vision' };
  }
  if (snap.waterMl < snap.waterTargetMl * 0.4) {
    return { label: 'Hydration', text: `${(snap.waterMl / 1000).toFixed(1)}L down, ${((snap.waterTargetMl - snap.waterMl) / 1000).toFixed(1)}L to go. One glass now?`, cta: 'Log water', to: '/portal/progress' };
  }
  if (snap.exerciseMinutes === 0) {
    return { label: 'Movement', text: 'A 10-minute walk would do wonders right now.', cta: 'Tell SIRAH about it', to: '/portal/voice' };
  }
  return {
    label: 'On track',
    text: snap.streakDays > 1 ? `${snap.streakDays} days in a row. Quiet consistency wins.` : 'You\'re tracking well. Keep the rhythm going.',
    cta: 'See your progress',
    to: '/portal/progress',
  };
}
