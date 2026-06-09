import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { FileText, Download, Sparkles, TrendingUp, X, Loader2 } from 'lucide-react';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';

type ReportKind = 'weekly_progress' | 'monthly_wellness';

interface ReportConfig {
  kind: ReportKind;
  title: string;
  windowLabel: string;
  windowDays: number;
}

const REPORTS: Record<ReportKind, ReportConfig> = {
  weekly_progress:  { kind: 'weekly_progress',  title: 'Weekly progress report',  windowLabel: 'past 7 days',  windowDays: 7 },
  monthly_wellness: { kind: 'monthly_wellness', title: 'Monthly wellness summary', windowLabel: 'past 30 days', windowDays: 30 },
};

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

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10 print:hidden"
      >
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Insights · Reports</span>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Your wellness story.</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65">
            AI-generated reports + downloadable progress summaries you can share with your nutritionist or your doctor.
          </p>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-6">
          <AIGlow intensity="soft" animated>
            <Glass variant="heavy" className="p-5">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 flex-shrink-0 text-violet-600 dark:text-violet-200" />
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
                    AI summary · This week
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/85">
                    Reports include your meals, habits, weight trend, achievements, and a short AI commentary on what's
                    going well and what to watch. Generate either report below — your browser will offer "Save as PDF"
                    in the print dialog.
                  </p>
                </div>
              </div>
            </Glass>
          </AIGlow>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-6 grid gap-3 sm:grid-cols-2">
          <Glass className="p-5">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-foreground/55">Progress</div>
            <div className="mt-1 text-base font-semibold">Weekly progress report</div>
            <p className="mt-1 text-xs text-foreground/65">
              Trends across meals, habits, and activity over the past 7 days.
            </p>
            <button
              type="button"
              onClick={() => setActive('weekly_progress')}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3 py-1.5 text-xs hover:bg-foreground/[0.05]"
            >
              <Download className="h-3 w-3" /> Generate
            </button>
          </Glass>

          <Glass className="p-5">
            <FileText className="h-5 w-5 text-violet-600 dark:text-violet-300" />
            <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-foreground/55">Wellness</div>
            <div className="mt-1 text-base font-semibold">Monthly wellness summary</div>
            <p className="mt-1 text-xs text-foreground/65">
              The big picture — weight, sleep, mood, and milestones.
            </p>
            <button
              type="button"
              onClick={() => setActive('monthly_wellness')}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3 py-1.5 text-xs hover:bg-foreground/[0.05]"
            >
              <Download className="h-3 w-3" /> Generate
            </button>
          </Glass>
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
      <div className="fixed inset-0 z-40 overflow-y-auto bg-canvas/95 backdrop-blur-md print:hidden">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-foreground/[0.06] bg-canvas/85 px-4 py-3 backdrop-blur-xl">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-foreground/65 hover:bg-foreground/[0.05]"
          >
            <X className="h-3.5 w-3.5" /> Close
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-xs font-medium text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.55)] disabled:opacity-60"
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
            SIRAH LIFE · Wellness report
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
        SIRAH LIFE · sirahdigital.in
      </footer>
    </div>
  );
}

function ReportTile({ label, value, subtitle, accent }: { label: string; value: string; subtitle: string; accent: 'indigo' | 'amber' | 'emerald' }) {
  const map = {
    indigo:  'bg-indigo-50 text-indigo-700',
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