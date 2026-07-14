import { useEffect, useState, type ComponentType } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, MessageCircle, Calendar, Droplet, Moon, Activity, Smile,
  ArrowRight, Sparkles, Brain, Sun, Sunrise, Sunset, Utensils, ClipboardList,
  ClipboardCheck, Plus, Minus, X, Check, Loader2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { WELLNESS_QUOTES } from '@/lib/quotes';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { ResponsiveModal } from '@/components/mobile/ResponsiveModal';
import {
  FestivalRibbon, MilestoneCelebration,
} from '@/modules/client/components/HomeWaveOneInserts';
import { useWorkspaceBrand } from '@/lib/workspaceBrand';
import { clientsApi, type AssessmentCard } from '@/modules/workspace/api/clients';
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
  // One aggregate call powers the dashboard (profile + snapshot + program +
  // messages + mood + assessments) — a single round-trip instead of six. Meals
  // stay a separate query: that endpoint is feature-gated on calorie_counting.
  const homeQ  = useQuery({ queryKey: ['me', 'home'],      queryFn: () => clientsApi.home(),   retry: 1 });
  const mealsQ = useQuery({ queryKey: ['me', 'meals', 14], queryFn: () => clientsApi.myMeals(14), retry: 1 });

  const { logoUrl, palette, practiceName } = useWorkspaceBrand();

  // Inline quick-logging from the habit tiles — no need to leave Today.
  const [activeLog, setActiveLog] = useState<HabitMetric | null>(null);
  // Rotating focus nudge (index into the applicable nudges).
  const [focusIdx, setFocusIdx] = useState(0);
  const habitMut = useMutation({
    mutationFn: (patch: Parameters<typeof clientsApi.logHabit>[0]) => clientsApi.logHabit(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      setActiveLog(null);
    },
    onError: () => toast.error('Could not save that — try again.'),
  });
  const moodMut = useMutation({
    mutationFn: (mood: number) => clientsApi.logMood({ mood }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      setActiveLog(null);
    },
    onError: () => toast.error('Could not save that — try again.'),
  });
  const saving = habitMut.isPending || moodMut.isPending;

  // Live ticking clock for the banner.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const home = homeQ.data;
  const profile = home?.profile ?? undefined;
  const firstName = profile?.name?.split(' ')[0] ?? '';
  const snap = home?.snapshot ?? undefined;
  const meals = mealsQ.data ?? [];
  const program = home?.program ?? undefined;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMealCount = meals.filter((m) => m.logged_at.slice(0, 10) === todayStr).length;
  const moodDays = home?.mood ?? [];
  const todayMood = moodDays[0]?.date === todayStr ? moodDays[0] : null;
  // The newest message actually FROM the nutritionist (not the client), with
  // real text — sorted by time so it's never an older one from the fetch window.
  const latestNudge = (home?.messages ?? [])
    .filter((m) => m.sender_type !== 'client' && (m.content ?? '').trim().length > 0)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const pendingAssessments = (home?.assessments ?? []).filter((c) => !c.has_responses);

  const focuses = buildFocuses(snap, todayMealCount, todayMood?.mood ?? null);
  // Auto-rotate the nudge every 6s so the card stays fresh; pauses at 1 item.
  useEffect(() => {
    if (focuses.length <= 1) return;
    const t = setInterval(() => setFocusIdx((i) => (i + 1) % focuses.length), 6000);
    return () => clearInterval(t);
  }, [focuses.length]);
  const focus = focuses[focusIdx % focuses.length] ?? focuses[0];

  // Rotating banner quote — the client's own set, or a gentle default. Picks
  // one per calendar day so it feels fresh without changing on every render.
  const quotes = profile?.banner_quotes && profile.banner_quotes.length > 0 ? profile.banner_quotes : DEFAULT_QUOTES;
  const quote = quotes[Math.floor(now.getTime() / 86_400_000) % quotes.length];

  // Two-pane summary: wellness score + the four habit metrics (tap to log).
  const scoreVal = snap && snap.score > 0 ? snap.score : null;
  const SCORE_C = 2 * Math.PI * 52;
  const SUMMARY_METRICS: Array<{
    key: HabitMetric; icon: ComponentType<{ className?: string }>;
    label: string; value: string; pct: number; tint: string; text: string; bar: string;
  }> = [
    { key: 'water', icon: Droplet, label: 'Water', value: snap?.waterMl ? `${(snap.waterMl / 1000).toFixed(1)}L` : '—', pct: snap ? (snap.waterMl / snap.waterTargetMl) * 100 : 0, tint: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-300', bar: 'bg-blue-500' },
    { key: 'sleep', icon: Moon, label: 'Sleep', value: snap?.sleepHours != null ? `${snap.sleepHours}h` : '—', pct: snap?.sleepHours != null ? (snap.sleepHours / 8) * 100 : 0, tint: 'bg-teal-500/15', text: 'text-teal-600 dark:text-teal-300', bar: 'bg-teal-500' },
    { key: 'move', icon: Activity, label: 'Move', value: snap?.exerciseMinutes ? `${snap.exerciseMinutes}m` : '—', pct: snap ? (snap.exerciseMinutes / 30) * 100 : 0, tint: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-300', bar: 'bg-emerald-500' },
    { key: 'mood', icon: Smile, label: 'Mood', value: todayMood?.mood ? moodWord(todayMood.mood) : 'Tap', pct: todayMood?.mood ? (todayMood.mood / 5) * 100 : 0, tint: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-300', bar: 'bg-amber-500' },
  ];

  return (
    <ClientLayout
      firstName={firstName || undefined}
      onRefresh={() => qc.invalidateQueries({ queryKey: ['me'] })}
    >
      <MilestoneCelebration />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 md:py-8">
        <FestivalRibbon />

        {/* Top bar — greeting + primary action (matches the redesign spec) */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-foreground/[0.06] pb-5">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/55">
              <GreetingIcon className="h-3.5 w-3.5 text-amber-500 dark:text-amber-300" /> {greetingTime()}
            </div>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight md:text-3xl">Hi{profile?.name ? `, ${profile.name}` : ''}.</h1>
            <p className="mt-1 text-sm text-foreground/60">{formatDate(now)}{quote ? ` · “${quote}”` : ''}</p>
          </div>
          <Link
            to="/portal/plate-vision"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
          >
            <Plus className="h-4 w-4" /> Log meal
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">

          {/* ── LEFT: "You today" summary pane (sticky on desktop) ───── */}
          <aside className="lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1">
            <Glass className="space-y-4 p-5">
              <div className="flex flex-col items-center text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-base font-semibold text-white">
                  {initialsOf(profile?.name ?? firstName ?? '')}
                </div>
                <div className="mt-2 text-base font-bold">{profile?.name ?? (firstName || 'Welcome')}</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/45">Your day</div>
              </div>

              <div className="flex flex-col items-center gap-2">
                <div className="relative h-[112px] w-[112px]">
                  <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                    <circle cx="60" cy="60" r="52" fill="none" strokeWidth="9" className="stroke-foreground/[0.08]" />
                    <circle
                      cx="60" cy="60" r="52" fill="none" strokeWidth="9" strokeLinecap="round" stroke="hsl(var(--primary))"
                      strokeDasharray={SCORE_C} strokeDashoffset={scoreVal != null ? SCORE_C * (1 - scoreVal / 100) : SCORE_C}
                      className="transition-[stroke-dashoffset] duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold tabular-nums">{scoreVal ?? '—'}</span>
                    <span className="text-[9px] uppercase tracking-[0.18em] text-foreground/45">Wellness</span>
                  </div>
                </div>
                {snap && snap.streakDays > 1 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    🔥 {snap.streakDays}-day streak
                  </span>
                )}
              </div>

              <div>
                <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/45">Today</div>
                <div className="space-y-1">
                  {SUMMARY_METRICS.map((m) => {
                    const clamped = Math.max(0, Math.min(100, m.pct));
                    const active = activeLog === m.key;
                    return (
                      <button
                        key={m.key} type="button"
                        onClick={() => setActiveLog((a) => (a === m.key ? null : m.key))}
                        className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors', active ? 'bg-primary/10' : 'hover:bg-foreground/[0.04]')}
                      >
                        <span className={cn('grid h-9 w-9 flex-none place-items-center rounded-lg', m.tint)}>
                          <m.icon className={cn('h-4 w-4', m.text)} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground/70">{m.label}</span>
                            <span className="font-semibold tabular-nums">{m.value}</span>
                          </span>
                          <span className="mt-1.5 block h-2 w-full overflow-hidden rounded-full bg-foreground/[0.08]">
                            <span className={cn('block h-full rounded-full', m.bar)} style={{ width: `${clamped}%` }} />
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <ResponsiveModal
                  open={activeLog !== null}
                  onOpenChange={(o) => { if (!o) setActiveLog(null); }}
                  title={activeLog ? `Log ${SUMMARY_METRICS.find((mm) => mm.key === activeLog)?.label ?? ''}` : ''}
                  className="sm:max-w-sm"
                >
                  {activeLog && (
                    <QuickLogPanel
                      metric={activeLog} saving={saving}
                      currentWaterMl={snap?.waterMl ?? 0} currentMoveMin={snap?.exerciseMinutes ?? 0}
                      currentSleepH={snap?.sleepHours ?? null} currentMood={todayMood?.mood ?? null}
                      onClose={() => setActiveLog(null)}
                      onLogHabit={(patch) => habitMut.mutate(patch)} onLogMood={(m) => moodMut.mutate(m)}
                    />
                  )}
                </ResponsiveModal>
              </div>

              <Link
                to="/portal/plate-vision"
                className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.01] cta-glow active:scale-[0.97]"
              >
                <Camera className="h-4 w-4" /> Open Plate Vision
              </Link>
            </Glass>
          </aside>

          {/* ── RIGHT: content feed ─────────────────────────────────── */}
          <div className="min-w-0 space-y-6">

        {/* ── Focus card — a rotating "next thing to do" nudge ──────── */}
        <motion.div variants={fadeUp}>
          <Glass className="relative overflow-hidden p-6">
            <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-teal-500/10 blur-3xl" />
            <AnimatePresence mode="wait">
              <motion.div
                key={focusIdx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
                className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.20)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-600 dark:text-teal-300">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.20em] text-foreground/45">{focus.label}</div>
                    <p className="mt-1.5 text-lg font-bold leading-snug">{focus.text}</p>
                  </div>
                </div>
                <Link
                  to={focus.to}
                  className="group inline-flex flex-shrink-0 items-center justify-center gap-1.5 self-start whitespace-nowrap rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97] sm:self-auto"
                >
                  {focus.cta}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </motion.div>
            </AnimatePresence>

            {focuses.length > 1 && (
              <div className="relative mt-4 flex justify-center gap-1.5">
                {focuses.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setFocusIdx(i)}
                    aria-label={`Show nudge ${i + 1}`}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === (focusIdx % focuses.length) ? 'w-4 bg-teal-500' : 'w-1.5 bg-foreground/20 hover:bg-foreground/35',
                    )}
                  />
                ))}
              </div>
            )}
          </Glass>
        </motion.div>

        {/* ── Assessment(s) assigned by the nutritionist ───────────── */}
        {pendingAssessments.length > 0 && (
          <motion.div variants={fadeUp}>
            <AssessmentTodoCard items={pendingAssessments} />
          </motion.div>
        )}

          {/* Habit metrics + tap-to-log now live in the summary pane. */}

        {/* ── Nutrition ────────────────────────────────────────────── */}
        <motion.div variants={fadeUp}>
          <NutritionCard
            meals={meals}
            todayKcal={snap?.todayKcal}
            targetKcal={snap?.targetKcal ?? null}
            loading={mealsQ.isLoading}
          />
        </motion.div>

        {/* ── From your nutritionist ───────────────────────────────── */}
        <motion.div variants={fadeUp}>
          <NutritionistCard nudge={latestNudge ?? null} loading={homeQ.isLoading} />
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
            <QuickActionCard to="/portal/assistant"    icon={Sparkles}      label="Assistant" highlight />
            <QuickActionCard to="/portal/chat"         icon={MessageCircle} label="Chat" />
            <QuickActionCard to="/portal/appointments" icon={Calendar}      label="Book" />
          </div>
        </motion.div>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ClientBanner — branded gradient hero with logo, greeting, clock, score.
// ─────────────────────────────────────────────────────────────────────────

function ClientBanner({
  firstName, practiceName, logoUrl, primary, accent, now, score, scoreLabel, quote,
}: {
  firstName: string;
  practiceName: string;
  logoUrl: string | null;
  primary: string;
  accent: string;
  now: Date;
  score: number | null;
  scoreLabel?: string;
  quote?: string;
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
            {quote && (
              <p className="mt-3 max-w-md border-l-2 border-foreground/15 pl-3 text-sm italic leading-snug text-foreground/70">
                “{quote}”
              </p>
            )}
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
// AssessmentTodoCard — surfaces assessments the nutritionist assigned that
// the client hasn't filled in yet. High-priority, so it sits near the top.
// ─────────────────────────────────────────────────────────────────────────

function AssessmentTodoCard({ items }: { items: AssessmentCard[] }) {
  const first = items[0];
  const title = (first?.generated_content?.title as string | undefined) ?? 'an assessment';
  const multiple = items.length > 1;

  return (
    <Glass className="relative overflow-hidden border-amber-400/30 p-6">
      <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-amber-400/15 text-amber-600 dark:text-amber-300">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.20em] text-amber-600/90 dark:text-amber-300/90">
                From your nutritionist
              </span>
              {multiple && (
                <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-200">
                  {items.length}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-lg font-bold leading-snug">
              {multiple
                ? `You have ${items.length} assessments to complete.`
                : `Please complete your ${title}.`}
            </p>
            {multiple && (
              <p className="mt-1 text-sm text-foreground/60">Starting with “{title}”.</p>
            )}
          </div>
        </div>
        <Link
          to="/portal/assessments"
          className="group inline-flex flex-shrink-0 items-center justify-center gap-1.5 self-start whitespace-nowrap rounded-full bg-gradient-to-br from-amber-500 to-orange-500 px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97] sm:self-auto"
        >
          {multiple ? 'View assessments' : 'Start assessment'}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// HabitTile — ring stat card.
// ─────────────────────────────────────────────────────────────────────────

type HabitAccent = 'blue' | 'violet' | 'emerald' | 'amber';

interface AccentStyle {
  ring: string;          // progress stroke colour
  icon: string;          // icon colour
  chip: string;          // icon chip gradient
  glow: string;          // soft background glow
  grad: [string, string]; // svg gradient stops
}
const HABIT_ACCENT: Record<HabitAccent, AccentStyle> = {
  blue: {
    ring: 'text-blue-500', icon: 'text-blue-600 dark:text-blue-300',
    chip: 'from-blue-500/25 to-cyan-400/15', glow: 'bg-blue-500/10',
    grad: ['#3b82f6', '#22d3ee'],
  },
  violet: {
    ring: 'text-teal-500', icon: 'text-teal-600 dark:text-teal-300',
    chip: 'from-teal-500/25 to-cyan-400/15', glow: 'bg-teal-500/10',
    grad: ['#0e9aa8', '#38d6e6'],
  },
  emerald: {
    ring: 'text-emerald-500', icon: 'text-emerald-600 dark:text-emerald-300',
    chip: 'from-emerald-500/25 to-teal-400/15', glow: 'bg-emerald-500/10',
    grad: ['#10b981', '#2dd4bf'],
  },
  amber: {
    ring: 'text-amber-500', icon: 'text-amber-600 dark:text-amber-300',
    chip: 'from-amber-400/30 to-orange-400/15', glow: 'bg-amber-400/10',
    grad: ['#f59e0b', '#fb923c'],
  },
};

function HabitTile({
  icon: Icon, label, value, pct, accent, onClick, active,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string; value: string; pct: number; accent: HabitAccent;
  onClick: () => void; active: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const radius = 18;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (clamped / 100) * circ;
  const a = HABIT_ACCENT[accent];
  const gradId = `habit-grad-${accent}`;
  const empty = clamped === 0;

  return (
    <button type="button" onClick={onClick} className="group text-left">
      <Glass className={cn(
        'relative flex flex-col items-center overflow-hidden p-4 transition-all duration-300',
        'group-hover:-translate-y-0.5 group-hover:shadow-[0_12px_30px_-16px_rgba(0,0,0,0.45)]',
        active ? 'ring-2 ring-teal-400/60' : 'group-hover:bg-foreground/[0.03]',
      )}>
        {/* soft accent glow */}
        <div className={cn('pointer-events-none absolute -top-8 left-1/2 h-20 w-20 -translate-x-1/2 rounded-full blur-2xl transition-opacity', a.glow, empty ? 'opacity-40' : 'opacity-100')} />

        <div className="relative h-16 w-16">
          <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={a.grad[0]} />
                <stop offset="100%" stopColor={a.grad[1]} />
              </linearGradient>
            </defs>
            <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeWidth="3.5" className="text-foreground/[0.07]" />
            <circle
              cx="22" cy="22" r={radius} fill="none"
              stroke={empty ? 'currentColor' : `url(#${gradId})`}
              strokeWidth="3.5" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={empty ? circ * 0.97 : offset}
              className={cn('transition-all duration-700', empty && 'text-foreground/15')}
            />
          </svg>
          {/* icon chip */}
          <div className="absolute inset-0 grid place-items-center">
            <div className={cn('grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br shadow-inner', a.chip)}>
              <Icon className={cn('h-4 w-4', a.icon)} />
            </div>
          </div>
        </div>

        <div className={cn('mt-2.5 text-base font-semibold tabular-nums', empty && 'text-foreground/45')}>{value}</div>
        <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-foreground/45">{label}</div>

        {/* tap-to-log affordance */}
        <span className={cn(
          'mt-1.5 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-colors',
          active ? 'bg-teal-500/15 text-teal-700 dark:text-teal-200' : 'text-foreground/35 group-hover:text-foreground/60',
        )}>
          <Plus className="h-2.5 w-2.5" /> Log
        </span>
      </Glass>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// QuickLogPanel — inline logger that expands under the habit tiles so the
// client can log water / sleep / move / mood without leaving Today.
// Water & Move are additive (current + delta); Sleep & Mood set an absolute.
// ─────────────────────────────────────────────────────────────────────────

type HabitMetric = 'water' | 'sleep' | 'move' | 'mood';

function QuickLogPanel({
  metric, saving, currentWaterMl, currentMoveMin, currentSleepH, currentMood,
  onClose, onLogHabit, onLogMood,
}: {
  metric: HabitMetric;
  saving: boolean;
  currentWaterMl: number;
  currentMoveMin: number;
  currentSleepH: number | null;
  currentMood: number | null;
  onClose: () => void;
  onLogHabit: (patch: Parameters<typeof clientsApi.logHabit>[0]) => void;
  onLogMood: (mood: number) => void;
}) {
  const meta: Record<HabitMetric, { title: string; icon: ComponentType<{ className?: string }> }> = {
    water: { title: 'Log water', icon: Droplet },
    sleep: { title: 'Log sleep', icon: Moon },
    move:  { title: 'Log movement', icon: Activity },
    mood:  { title: 'Log mood', icon: Smile },
  };
  const { title, icon: Icon } = meta[metric];
  // Custom water amount for the magnetic stepper (snaps in 50ml steps).
  const [customMl, setCustomMl] = useState(250);

  return (
    <div className="space-y-3 pt-1">
      {saving ? (
        <div className="flex items-center justify-center py-3 text-sm text-foreground/55">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
        </div>
      ) : metric === 'water' ? (
        <div>
          <div className="mb-2 text-xs text-foreground/55">Today: {(currentWaterMl / 1000).toFixed(2)} L</div>
          <div className="flex flex-wrap gap-2">
            {[250, 500, 750].map((ml) => (
              <Chip key={ml} onClick={() => onLogHabit({ water_ml: currentWaterMl + ml })}>
                <Plus className="h-3.5 w-3.5" /> {ml} ml
              </Chip>
            ))}
          </div>
          {/* Custom amount via a magnetic stepper (snaps in 50ml steps). */}
          <div className="mt-3 flex flex-col items-stretch gap-3 border-t border-foreground/[0.06] pt-3">
            <div className="flex justify-center">
              <Stepper value={customMl} onChange={setCustomMl} step={50} min={50} max={2000} unit="ml" />
            </div>
            <button
              type="button"
              onClick={() => onLogHabit({ water_ml: currentWaterMl + customMl })}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-teal-400/50 bg-teal-500/15 px-3.5 py-2 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-500/25 dark:text-teal-200"
            >
              <Plus className="h-3.5 w-3.5" /> Add {customMl} ml
            </button>
          </div>
        </div>
      ) : metric === 'move' ? (
        <div>
          <div className="mb-2 text-xs text-foreground/55">Today: {currentMoveMin} min</div>
          <div className="flex flex-wrap gap-2">
            {[15, 30, 45, 60].map((min) => (
              <Chip key={min} onClick={() => onLogHabit({ exercise_minutes: currentMoveMin + min })}>
                <Plus className="h-3.5 w-3.5" /> {min} min
              </Chip>
            ))}
          </div>
        </div>
      ) : metric === 'sleep' ? (
        <div>
          <div className="mb-2 text-xs text-foreground/55">
            How many hours did you sleep?{currentSleepH != null ? ` (now ${currentSleepH}h)` : ''}
          </div>
          <div className="flex flex-wrap gap-2">
            {[5, 6, 6.5, 7, 7.5, 8, 8.5, 9].map((h) => (
              <Chip key={h} active={currentSleepH === h} onClick={() => onLogHabit({ sleep_hours: h })}>
                {h}h
              </Chip>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-2 text-xs text-foreground/55">How are you feeling right now?</div>
          <div className="flex flex-wrap gap-2">
            {[
              { v: 1, label: 'Low' }, { v: 2, label: 'Meh' }, { v: 3, label: 'Okay' },
              { v: 4, label: 'Good' }, { v: 5, label: 'Great' },
            ].map((m) => (
              <Chip key={m.v} active={currentMood === m.v} onClick={() => onLogMood(m.v)}>
                {currentMood === m.v && <Check className="h-3.5 w-3.5" />} {m.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Magnetic stepper — ± buttons that snap to `step` increments, with a soft
// settle on the value each change. Used for the custom water amount.
function Stepper({
  value, onChange, step, min, max, unit,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  unit?: string;
}) {
  const change = (d: number) => onChange(Math.max(min, Math.min(max, value + d)));
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => change(-step)}
        disabled={value <= min}
        aria-label={`Decrease by ${step}`}
        className="grid h-9 w-9 place-items-center rounded-xl border border-foreground/10 bg-foreground/[0.03] text-foreground/80 transition-transform hover:bg-foreground/[0.07] active:scale-90 disabled:opacity-40"
      >
        <Minus className="h-4 w-4" />
      </button>
      <motion.span
        key={value}
        initial={{ scale: 0.7 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
        className="min-w-[72px] text-center text-base font-semibold tabular-nums"
      >
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-foreground/55">{unit}</span>}
      </motion.span>
      <button
        type="button"
        onClick={() => change(step)}
        disabled={value >= max}
        aria-label={`Increase by ${step}`}
        className="grid h-9 w-9 place-items-center rounded-xl border border-foreground/10 bg-foreground/[0.03] text-foreground/80 transition-transform hover:bg-foreground/[0.07] active:scale-90 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function Chip({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-teal-400/50 bg-teal-500/15 text-teal-700 dark:text-teal-200'
          : 'border-foreground/10 bg-foreground/[0.03] text-foreground/80 hover:bg-foreground/[0.07]',
      )}
    >
      {children}
    </button>
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
          <Utensils className="h-4 w-4 text-teal-600 dark:text-teal-300" />
          <span className="text-sm font-bold">Today's nutrition</span>
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
            <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-10 text-sm text-foreground/50">Loading…</div>
      ) : meals.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-8 text-center">
          <Camera className="h-7 w-7 text-foreground/20" />
          <div className="mt-2 text-sm text-foreground/65">No meals logged yet</div>
          <Link
            to="/portal/plate-vision"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3.5 py-1.5 text-xs font-medium text-foreground/85 hover:bg-foreground/[0.08]"
          >
            <Camera className="h-3.5 w-3.5" /> Snap a meal
          </Link>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-foreground/[0.04] px-5">
          {meals.slice(0, 2).map((m) => (
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
        <span className="text-sm font-bold">From your nutritionist</span>
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
        highlight ? 'border-teal-400/40' : 'border-foreground/[0.06]',
      )}
    >
      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 transition-colors group-hover:from-teal-500/25 group-hover:to-emerald-400/25 dark:text-teal-300">
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium">{label}</span>
      {highlight && (
        <span className="ml-auto rounded-full bg-teal-400/15 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-teal-700 dark:text-teal-200">AI</span>
      )}
    </Link>
  );
}

// ──────────────────────────────────────────────────────────────────

// Shared 100-quote wellness library — the daily default when the client hasn't
// added their own banner quotes. Same rotation as the nutritionist dashboard.
const DEFAULT_QUOTES = WELLNESS_QUOTES;

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
/**
 * Build the list of relevant nudges for the day, in priority order. The focus
 * card rotates through them so it stays fresh. Action nudges (mood, meal,
 * water, movement) only appear while they're still relevant; two evergreen
 * nudges (reflect, on-track) always trail so there's always something to show.
 */
function buildFocuses(
  snap: { todayKcal: number; targetKcal: number | null; waterMl: number; waterTargetMl: number; exerciseMinutes: number; streakDays: number } | undefined,
  mealCount: number,
  todayMood: number | null,
): Focus[] {
  if (!snap) {
    return [{ label: 'Welcome', text: 'Let\'s start with one small action today.', cta: 'Take a photo of what you ate', to: '/portal/plate-vision' }];
  }

  const out: Focus[] = [];
  if (todayMood == null) {
    out.push({ label: 'Take a moment', text: 'How are you feeling right now? One tap, then move on.', cta: 'Log mood', to: '/portal/wellbeing' });
  }
  if (mealCount === 0) {
    out.push({ label: 'Today', text: 'Snap your first meal and let NUSI do the calorie math.', cta: 'Open Plate Vision', to: '/portal/plate-vision' });
  }
  if (snap.waterMl < snap.waterTargetMl * 0.6) {
    const toGo = Math.max(0, (snap.waterTargetMl - snap.waterMl) / 1000);
    out.push({ label: 'Hydration', text: `${(snap.waterMl / 1000).toFixed(1)}L down, ${toGo.toFixed(1)}L to go. One glass now?`, cta: 'Log water', to: '/portal/progress' });
  }
  if (snap.exerciseMinutes === 0) {
    out.push({ label: 'Movement', text: 'A 10-minute walk would do wonders right now.', cta: 'Tell NUSI about it', to: '/portal/assistant' });
  }

  // Evergreen — keep the card lively even when the day is fully on track.
  out.push({ label: 'Reflect', text: 'Jot one line about today in your journal.', cta: 'Open journal', to: '/portal/journal' });
  out.push({
    label: snap.streakDays > 1 ? 'On a roll' : 'On track',
    text: snap.streakDays > 1 ? `${snap.streakDays} days in a row. Quiet consistency wins.` : 'You\'re tracking well. Keep the rhythm going.',
    cta: 'See your progress',
    to: '/portal/progress',
  });
  return out;
}
