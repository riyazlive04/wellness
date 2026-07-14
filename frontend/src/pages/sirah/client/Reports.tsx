import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  FileText, Download, Sparkles, TrendingUp, Loader2, FileBarChart,
  CalendarRange, ArrowRight, ChevronLeft, type LucideIcon,
} from 'lucide-react';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

type ReportKind = 'weekly_progress' | 'monthly_wellness';

interface ReportConfig {
  kind: ReportKind;
  title: string;
  windowLabel: string;
  windowDays: number;
  description: string;
  icon: LucideIcon;
  iconTint: string;
}

const REPORTS: Record<ReportKind, ReportConfig> = {
  weekly_progress: {
    kind: 'weekly_progress',
    title: 'Weekly progress report',
    windowLabel: 'past 7 days',
    windowDays: 7,
    description: 'Trends across meals, habits, hydration, and activity over the past 7 days.',
    icon: TrendingUp,
    iconTint: 'text-emerald-600 dark:text-emerald-300',
  },
  monthly_wellness: {
    kind: 'monthly_wellness',
    title: 'Monthly wellness summary',
    windowLabel: 'past 30 days',
    windowDays: 30,
    description: 'The big picture — weight, sleep, mood, milestones, and your AI commentary.',
    icon: FileText,
    iconTint: 'text-teal-600 dark:text-teal-300',
  },
};

const REPORT_LIST = Object.values(REPORTS);

/**
 * Reports — browser-side PDF generation via window.print().
 *
 * The user clicks "Generate" → we render a print-only report container
 * with all their data → call window.print() → browser's print dialog
 * opens with "Save as PDF" as a target. No backend PDF library needed,
 * no Puppeteer, no font licensing. Works on every modern browser.
 *
 * The trick is print-only CSS classes — the report container is
 * `print:block hidden` while the page UI is `print:hidden`. When the
 * print dialog fires, only the report renders.
 */
export default function ClientReports() {
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const [active, setActive] = useState<ReportKind | null>(null);

  const reportCount = REPORT_LIST.length;
  const latestDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="mx-auto w-full max-w-5xl space-y-7 px-5 py-8 md:px-8 md:py-10 print:hidden"
      >
        {/* Header */}
        <motion.div variants={fadeUp}>
          <div className="flex items-center gap-2 text-teal-600 dark:text-teal-300">
            <FileBarChart className="h-4 w-4" />
            <span className="text-xs uppercase tracking-[0.18em]">Insights · Reports</span>
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Your wellness story</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-foreground/60">
            AI-generated reports and downloadable progress summaries you can share with your nutritionist or your doctor.
          </p>
        </motion.div>

        {/* Stat strip */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Glass className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-teal-600 dark:text-teal-300" strokeWidth={1.8} />
              <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Reports available</span>
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{reportCount}</div>
          </Glass>
          <Glass className="p-4">
            <div className="flex items-center gap-2">
              <CalendarRange className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" strokeWidth={1.8} />
              <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">As of</span>
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">{latestDate}</div>
          </Glass>
          <Glass className="col-span-2 p-4 sm:col-span-1">
            <div className="flex items-center gap-2">
              <Download className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" strokeWidth={1.8} />
              <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Format</span>
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">PDF</div>
            <div className="mt-0.5 text-[11px] text-foreground/55">via browser print</div>
          </Glass>
        </motion.div>

        {/* AI summary banner */}
        <motion.div variants={fadeUp}>
          <AIGlow intensity="soft" animated>
            <Glass variant="heavy" className="p-5 md:p-6">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)]">
                  <Sparkles className="h-5 w-5 text-teal-600 dark:text-teal-200" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
                    AI summary · How reports work
                  </div>
                  <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-foreground/85">
                    Reports include your meals, habits, weight trend, achievements, and a short AI commentary on what's
                    going well and what to watch. Generate either report below — your browser will offer "Save as PDF"
                    in the print dialog.
                  </p>
                </div>
              </div>
            </Glass>
          </AIGlow>
        </motion.div>

        {/* Reports grid */}
        <motion.div variants={fadeUp}>
          <div className="mb-3 text-xs uppercase tracking-[0.18em] text-foreground/55">Available reports</div>
          {REPORT_LIST.length === 0 ? (
            <Glass className="flex flex-col items-center px-5 py-16 text-center">
              <FileBarChart className="h-10 w-10 text-foreground/25" />
              <div className="mt-4 text-base font-medium text-foreground/80">No reports yet</div>
              <div className="mt-1 max-w-sm text-sm text-foreground/55">
                As you log meals, habits, and milestones, downloadable reports will appear here.
              </div>
            </Glass>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {REPORT_LIST.map((r) => (
                <ReportCard key={r.kind} config={r} onGenerate={() => setActive(r.kind)} />
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>

      {active && (
        <ReportPreview
          config={REPORTS[active]}
          firstName={profileQ.data?.name ?? ''}
          email={profileQ.data?.email ?? ''}
          onClose={() => setActive(null)}
        />
      )}
    </ClientLayout>
  );
}

// ──────────────────────────────────────────────────────────────────
// ReportCard — one tile in the responsive reports grid.
// ──────────────────────────────────────────────────────────────────

function ReportCard({ config, onGenerate }: { config: ReportConfig; onGenerate: () => void }) {
  const Icon = config.icon;
  return (
    <Glass className="group flex h-full flex-col p-5">
      <div className="flex items-start justify-between">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.12)] to-[hsl(var(--brand-magenta)_/_0.12)]">
          <Icon className={cn('h-5 w-5', config.iconTint)} strokeWidth={1.8} />
        </div>
        <span className="rounded-full border border-foreground/10 bg-foreground/[0.03] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-foreground/55">
          {config.windowLabel}
        </span>
      </div>

      <div className="mt-4 text-base font-semibold tracking-tight">{config.title}</div>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-foreground/60">{config.description}</p>

      <button
        type="button"
        onClick={onGenerate}
        className="mt-5 inline-flex items-center justify-center gap-2 self-start rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-xs font-medium text-white shadow-[0_8px_24px_-8px_rgba(14,154,168,0.55)] transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
      >
        <Download className="h-3.5 w-3.5" /> Generate
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </button>
    </Glass>
  );
}

// ──────────────────────────────────────────────────────────────────
// The preview: full-screen modal on the app side, the only printable
// thing when the print dialog fires.
// ──────────────────────────────────────────────────────────────────

function ReportPreview({
  config, firstName, email, onClose,
}: { config: ReportConfig; firstName: string; email: string; onClose: () => void }) {
  const habitsQ = useQuery({
    queryKey: ['me', 'habits', config.windowDays],
    queryFn: () => clientsApi.myHabits(config.windowDays),
    retry: 1,
  });
  const mealsQ = useQuery({
    queryKey: ['me', 'meals', config.windowDays],
    queryFn: () => clientsApi.myMeals(config.windowDays),
    retry: 1,
  });
  const snapshotQ = useQuery({
    queryKey: ['me', 'wellness', 'snapshot'],
    queryFn: () => clientsApi.myWellnessSnapshot(),
    retry: 1,
  });
  const achievementsQ = useQuery({
    queryKey: ['me', 'achievements'],
    queryFn: () => clientsApi.myAchievements(),
    retry: 1,
  });

  const loading = habitsQ.isLoading || mealsQ.isLoading || snapshotQ.isLoading;

  const habits = habitsQ.data ?? [];
  const meals = mealsQ.data ?? [];
  const snap = snapshotQ.data;
  const achievements = achievementsQ.data ?? [];

  // Aggregations
  const totalMeals = meals.length;
  const avgKcal = totalMeals > 0
    ? Math.round(meals.reduce((s, m) => s + (m.kcal ?? 0), 0) / Math.min(totalMeals, config.windowDays))
    : 0;
  const avgWater = habits.length > 0
    ? Math.round(habits.reduce((s, h) => s + h.water_ml, 0) / habits.length)
    : 0;
  const avgExercise = habits.length > 0
    ? Math.round(habits.reduce((s, h) => s + h.exercise_minutes, 0) / habits.length)
    : 0;
  const sleepLogs = habits.filter((h) => h.sleep_hours != null);
  const avgSleep = sleepLogs.length > 0
    ? (sleepLogs.reduce((s, h) => s + (h.sleep_hours ?? 0), 0) / sleepLogs.length).toFixed(1)
    : null;
  const weightLogs = habits.filter((h) => h.weight_kg != null).map((h) => h.weight_kg as number);
  const weightChange = weightLogs.length >= 2 ? (weightLogs[0] - weightLogs[weightLogs.length - 1]).toFixed(1) : null;
  const earnedAchievements = achievements.filter((a) => a.earned_at);

  return (
    <>
      {/* App-side controls (hidden in print) */}
      <div className="fixed inset-0 z-40 overflow-y-auto bg-canvas/95 backdrop-blur-md print:hidden md:left-[260px]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-foreground/[0.06] bg-canvas/85 px-4 py-3 backdrop-blur-xl">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3 py-1.5 text-xs font-medium text-foreground/75 hover:bg-foreground/[0.05]"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-xs font-medium text-white shadow-[0_8px_24px_-8px_rgba(14,154,168,0.55)] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Save as PDF
          </button>
        </div>
        <div className="mx-auto max-w-3xl p-6">
          <p className="mb-4 text-xs text-foreground/55">
            Click <strong>Save as PDF</strong> to open your browser's print dialog. Pick "Save as PDF" as the destination
            — every modern browser supports it. The preview below is exactly what gets saved.
          </p>
          <ReportBody
            config={config}
            firstName={firstName}
            email={email}
            snap={snap}
            avgKcal={avgKcal}
            avgWater={avgWater}
            avgExercise={avgExercise}
            avgSleep={avgSleep}
            weightChange={weightChange}
            totalMeals={totalMeals}
            achievements={earnedAchievements}
          />
        </div>
      </div>

      {/* Print-only: the actual report body, full page, no chrome */}
      <div className="hidden print:block">
        <ReportBody
          config={config}
          firstName={firstName}
          email={email}
          snap={snap}
          avgKcal={avgKcal}
          avgWater={avgWater}
          avgExercise={avgExercise}
          avgSleep={avgSleep}
          weightChange={weightChange}
          totalMeals={totalMeals}
          achievements={earnedAchievements}
        />
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// The actual report layout. Reused for both screen preview and print.
// Uses semantic HTML + simple colors so it prints cleanly without
// fighting the canvas background.
// ──────────────────────────────────────────────────────────────────

function ReportBody({
  config, firstName, email, snap, avgKcal, avgWater, avgExercise, avgSleep,
  weightChange, totalMeals, achievements,
}: {
  config: ReportConfig;
  firstName: string;
  email: string;
  snap: Awaited<ReturnType<typeof clientsApi.myWellnessSnapshot>> | undefined;
  avgKcal: number;
  avgWater: number;
  avgExercise: number;
  avgSleep: string | null;
  weightChange: string | null;
  totalMeals: number;
  achievements: { id: string; title: string; icon: string }[];
}) {
  const generatedAt = new Date().toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div
      className="report-body rounded-xl bg-white p-10 text-slate-900 shadow-2xl print:shadow-none print:rounded-none"
      style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    >
      {/* Letterhead */}
      <header className="flex items-start justify-between border-b border-slate-200 pb-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
            NUSI · Wellness report
          </div>
          <h1 className="mt-2 text-2xl font-semibold leading-tight">{config.title}</h1>
          <div className="mt-1 text-xs text-slate-500">
            For {firstName}{email ? ` · ${email}` : ''} · {config.windowLabel}
          </div>
        </div>
        <div className="text-right text-[10px] uppercase tracking-[0.18em] text-slate-400">
          Generated<br />{generatedAt}
        </div>
      </header>

      {/* Wellness score */}
      {snap && (
        <section className="mt-8">
          <div className="grid grid-cols-3 gap-4">
            <ReportTile label="Wellness score" value={String(snap.score)} subtitle={snap.scoreLabel} accent="indigo" />
            <ReportTile label="Streak" value={`${snap.streakDays} days`} subtitle="of consistent logging" accent="amber" />
            <ReportTile label="Habits today" value={`${snap.habitsCompletedToday}/${snap.habitsTotal}`} subtitle="completed" accent="emerald" />
          </div>
        </section>
      )}

      {/* Headline numbers */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          {config.windowLabel.charAt(0).toUpperCase() + config.windowLabel.slice(1)} · averages
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Avg kcal/day" value={avgKcal || '—'} />
          <Stat label="Avg water" value={avgWater ? `${(avgWater / 1000).toFixed(1)}L` : '—'} />
          <Stat label="Avg exercise" value={`${avgExercise}m`} />
          <Stat label="Avg sleep" value={avgSleep ? `${avgSleep}h` : '—'} />
        </div>
      </section>

      {/* Weight + meals */}
      <section className="mt-8 grid grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Weight</h2>
          <div className="mt-2 text-xl font-semibold">
            {weightChange != null
              ? `${weightChange.startsWith('-') ? '' : '+'}${weightChange} kg`
              : 'Not tracked'}
          </div>
          <div className="mt-1 text-xs text-slate-500">net change across the window</div>
        </div>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Meals logged</h2>
          <div className="mt-2 text-xl font-semibold">{totalMeals}</div>
          <div className="mt-1 text-xs text-slate-500">total entries</div>
        </div>
      </section>

      {/* Achievements earned */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Achievements earned</h2>
        {achievements.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No badges earned in this window yet — keep stacking the small wins.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {achievements.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-200 p-3 text-center">
                <div className="text-2xl">{a.icon}</div>
                <div className="mt-1 text-xs font-medium">{a.title}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* AI commentary placeholder — fills in when /me/reports/ai-summary lands */}
      <section className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">AI commentary</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          {buildCommentary(avgKcal, avgWater, avgExercise, avgSleep, weightChange, totalMeals, achievements.length)}
        </p>
      </section>

      <footer className="mt-10 border-t border-slate-200 pt-4 text-[10px] uppercase tracking-[0.18em] text-slate-400">
        NUSI · sirahdigital.in
      </footer>
    </div>
  );
}

function ReportTile({ label, value, subtitle, accent }: { label: string; value: string; subtitle: string; accent: 'indigo' | 'amber' | 'emerald' }) {
  const map = {
    indigo:  'bg-teal-50 text-teal-700',
    amber:   'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  } as const;
  return (
    <div className={`rounded-lg p-4 ${map[accent]}`}>
      <div className="text-[10px] uppercase tracking-[0.18em] opacity-75">{label}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-xs opacity-75">{subtitle}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function buildCommentary(
  avgKcal: number,
  avgWater: number,
  avgExercise: number,
  avgSleep: string | null,
  weightChange: string | null,
  totalMeals: number,
  badgesEarned: number,
): string {
  const parts: string[] = [];
  if (totalMeals >= 14) parts.push('You\'ve been consistent with meal logging.');
  else if (totalMeals > 0) parts.push(`You logged ${totalMeals} meals — try to capture every meal for sharper insights.`);
  else parts.push('No meals logged in this window yet.');

  if (avgWater >= 2500) parts.push('Hydration is on target.');
  else if (avgWater >= 1500) parts.push('Hydration is close to target — add one extra glass mid-afternoon.');

  if (avgExercise >= 30) parts.push('Movement is excellent.');
  else if (avgExercise >= 15) parts.push('Movement is decent — a short evening walk would push you over the line.');

  if (avgSleep && Number(avgSleep) >= 7) parts.push('Sleep looks restorative.');
  if (weightChange != null) parts.push(`Net weight change of ${weightChange} kg over the window.`);
  if (badgesEarned > 0) parts.push(`You earned ${badgesEarned} badge${badgesEarned > 1 ? 's' : ''} — well done.`);

  return parts.join(' ');
}