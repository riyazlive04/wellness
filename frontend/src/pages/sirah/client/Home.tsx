import { useEffect, useState, type ComponentType } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, Mic, MessageCircle, Calendar, Droplet, Moon, Activity, Smile,
  ArrowRight, Sparkles, Brain, Sun, Sunrise, Sunset, Utensils, ClipboardList,
  ClipboardCheck, Plus, X, Check, Loader2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
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
  const profileQ  = useQuery({ queryKey: ['me', 'profile'],    queryFn: () => clientsApi.myProfile(),          retry: 1 });
  const snapshotQ = useQuery({ queryKey: ['me', 'wellness', 'snapshot'], queryFn: () => clientsApi.myWellnessSnapshot(), retry: 1 });
  const mealsQ    = useQuery({ queryKey: ['me', 'meals', 1],   queryFn: () => clientsApi.myMeals(1),           retry: 1 });
  const programQ  = useQuery({ queryKey: ['me', 'program'],    queryFn: () => clientsApi.myProgram(),          retry: 1 });
  const messagesQ = useQuery({ queryKey: ['me', 'messages'],   queryFn: () => clientsApi.myMessages(5),        retry: 1 });
  const moodQ     = useQuery({ queryKey: ['me', 'mood', 1],    queryFn: () => clientsApi.moodHistory(1),       retry: 1 });
  const summaryQ  = useQuery({ queryKey: ['me', 'weekly-summary'], queryFn: () => clientsApi.weeklySummary(), retry: 1, staleTime: 12 * 60 * 60 * 1000 });
  const assessmentsQ = useQuery({ queryKey: ['me', 'assessments'], queryFn: () => clientsApi.myAssessments(), retry: 1 });

  const { logoUrl, palette, practiceName } = useWorkspaceBrand();

  // Inline quick-logging from the habit tiles — no need to leave Today.
  const [activeLog, setActiveLog] = useState<HabitMetric | null>(null);
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

  const profile = profileQ.data;
  const firstName = profile?.name?.split(' ')[0] ?? '';
  const snap = snapshotQ.data;
  const meals = mealsQ.data ?? [];
  const program = programQ.data;
  const todayMood = moodQ.data?.[0]?.date === new Date().toISOString().slice(0, 10) ? moodQ.data[0] : null;
  const latestNudge = (messagesQ.data ?? []).find((m) => m.sender_type !== 'client');
  const pendingAssessments = (assessmentsQ.data ?? []).filter((c) => !c.has_responses);

  const focus = buildFocus(snap, meals.length, todayMood?.mood ?? null);

  // Rotating banner quote — the client's own set, or a gentle default. Picks
  // one per calendar day so it feels fresh without changing on every render.
  const quotes = profile?.banner_quotes && profile.banner_quotes.length > 0 ? profile.banner_quotes : DEFAULT_QUOTES;
  const quote = quotes[Math.floor(now.getTime() / 86_400_000) % quotes.length];

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
            quote={quote}
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

        {/* ── Assessment(s) assigned by the nutritionist ───────────── */}
        {pendingAssessments.length > 0 && (
          <motion.div variants={fadeUp}>
            <AssessmentTodoCard items={pendingAssessments} />
          </motion.div>
        )}

        {/* ── Habit KPI tiles — tap to log right here ──────────────── */}
        <motion.div variants={fadeUp}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HabitTile
              icon={Droplet} label="Water"
              value={snap?.waterMl ? `${(snap.waterMl / 1000).toFixed(1)}L` : '—'}
              pct={snap ? (snap.waterMl / snap.waterTargetMl) * 100 : 0}
              accent="blue" active={activeLog === 'water'}
              onClick={() => setActiveLog((m) => (m === 'water' ? null : 'water'))}
            />
            <HabitTile
              icon={Moon} label="Sleep"
              value={snap?.sleepHours != null ? `${snap.sleepHours}h` : '—'}
              pct={snap?.sleepHours != null ? (snap.sleepHours / 8) * 100 : 0}
              accent="violet" active={activeLog === 'sleep'}
              onClick={() => setActiveLog((m) => (m === 'sleep' ? null : 'sleep'))}
            />
            <HabitTile
              icon={Activity} label="Move"
              value={snap?.exerciseMinutes ? `${snap.exerciseMinutes}m` : '—'}
              pct={snap ? (snap.exerciseMinutes / 30) * 100 : 0}
              accent="emerald" active={activeLog === 'move'}
              onClick={() => setActiveLog((m) => (m === 'move' ? null : 'move'))}
            />
            <HabitTile
              icon={Smile} label="Mood"
              value={todayMood?.mood ? moodWord(todayMood.mood) : 'Tap'}
              pct={todayMood?.mood ? (todayMood.mood / 5) * 100 : 0}
              accent="amber" active={activeLog === 'mood'}
              onClick={() => setActiveLog((m) => (m === 'mood' ? null : 'mood'))}
            />
          </div>

          <AnimatePresence initial={false}>
            {activeLog && (
              <motion.div
                key={activeLog}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <QuickLogPanel
                  metric={activeLog}
                  saving={saving}
                  currentWaterMl={snap?.waterMl ?? 0}
                  currentMoveMin={snap?.exerciseMinutes ?? 0}
                  currentSleepH={snap?.sleepHours ?? null}
                  currentMood={todayMood?.mood ?? null}
                  onClose={() => setActiveLog(null)}
                  onLogHabit={(patch) => habitMut.mutate(patch)}
                  onLogMood={(m) => moodMut.mutate(m)}
                />
              </motion.div>
            )}
          </AnimatePresence>
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
      <div className="relative flex items-start gap-4">
        <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-amber-400/15 text-amber-600 dark:text-amber-300">
          <ClipboardCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
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
          <p className="mt-1.5 text-lg font-medium leading-snug">
            {multiple
              ? `You have ${items.length} assessments to complete.`
              : `Please complete your ${title}.`}
          </p>
          {multiple && (
            <p className="mt-1 text-sm text-foreground/60">Starting with “{title}”.</p>
          )}
          <Link
            to="/portal/assessments"
            className="group mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 px-4 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02]"
          >
            {multiple ? 'View assessments' : 'Start assessment'}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
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
    ring: 'text-violet-500', icon: 'text-violet-600 dark:text-violet-300',
    chip: 'from-violet-500/25 to-fuchsia-400/15', glow: 'bg-violet-500/10',
    grad: ['#8b5cf6', '#e879f9'],
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
        active ? 'ring-2 ring-violet-400/60' : 'group-hover:bg-foreground/[0.03]',
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
          active ? 'bg-violet-500/15 text-violet-700 dark:text-violet-200' : 'text-foreground/35 group-hover:text-foreground/60',
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

  return (
    <Glass className="mt-3 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-violet-600 dark:text-violet-300" />
          {title}
        </div>
        <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

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
    </Glass>
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
          ? 'border-violet-400/50 bg-violet-500/15 text-violet-700 dark:text-violet-200'
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

const DEFAULT_QUOTES = [
  'Small steps, every day.',
  'Progress over perfection.',
  'You showed up — that counts.',
  'One healthy choice at a time.',
  'Consistency beats intensity.',
  'Be patient with yourself.',
  'Your future self will thank you.',
];

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
