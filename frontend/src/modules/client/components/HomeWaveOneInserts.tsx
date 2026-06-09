import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import {
  Sparkles, Sunrise, Sun, Moon, Flag, Trophy, X, Brain, Loader2,
} from 'lucide-react';

import { AIGlow, Glass } from '@/design-system';
import { clientsApi } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Wave 1 widgets that live INSIDE the Home page:
 *   • <FestivalRibbon />      — banner above hero when a festival is <14 days away
 *   • <WeeklySummaryCard />   — AI-generated weekly check-in card
 *   • <MilestoneCelebration /> — full-screen modal when an uncelebrated milestone exists
 */

const ICONS: Record<string, typeof Sparkles> = {
  sparkles: Sparkles, sunrise: Sunrise, sun: Sun, moon: Moon, flag: Flag,
};

export function FestivalRibbon() {
  const festivalsQ = useQuery({
    queryKey: ['me', 'festivals'],
    queryFn: () => clientsApi.upcomingFestivals(),
    retry: 1,
    staleTime: 60 * 60 * 1000,
  });
  const next = (festivalsQ.data ?? []).find((f) => {
    const days = Math.ceil((new Date(f.date).getTime() - Date.now()) / 86_400_000);
    return days >= 0 && days <= 14;
  });
  if (!next) return null;

  const Icon = ICONS[next.icon] ?? Sparkles;
  const days = Math.ceil((new Date(next.date).getTime() - Date.now()) / 86_400_000);
  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5"
    >
      <Icon className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-300" />
      <div className="min-w-0 flex-1 text-xs text-foreground/85">
        <strong className="font-semibold">{next.name}</strong> {when}.{' '}
        <span className="text-foreground/65">{next.tone}</span>
      </div>
    </motion.div>
  );
}

export function WeeklySummaryCard() {
  const summaryQ = useQuery({
    queryKey: ['me', 'weekly-summary'],
    queryFn: () => clientsApi.weeklySummary(),
    retry: 1,
    staleTime: 12 * 60 * 60 * 1000,
  });
  return (
    <AIGlow intensity="soft" animated={false}>
      <Glass variant="heavy" className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-500/30 to-rose-500/20">
            <Brain className="h-5 w-5 text-amber-600 dark:text-amber-300" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
              This week — at a glance
            </div>
            {summaryQ.isLoading ? (
              <div className="mt-2 inline-flex items-center gap-2 text-sm text-foreground/55">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading your week…
              </div>
            ) : (
              <>
                <p className="mt-2 text-sm leading-relaxed text-foreground/85">
                  {summaryQ.data?.summary ?? 'Log a few days to see your weekly summary.'}
                </p>
                {summaryQ.data?.metrics && (
                  <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-foreground/55">
                    <span>{summaryQ.data.metrics.logged_days}/7 days logged</span>
                    {summaryQ.data.metrics.total_exercise_min > 0 && (
                      <span>· {summaryQ.data.metrics.total_exercise_min} min exercise</span>
                    )}
                    {summaryQ.data.metrics.meals_logged > 0 && (
                      <span>· {summaryQ.data.metrics.meals_logged} meals</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Glass>
    </AIGlow>
  );
}

export function MilestoneCelebration() {
  const queryClient = useQueryClient();
  const milestonesQ = useQuery({
    queryKey: ['me', 'milestones'],
    queryFn: () => clientsApi.myMilestones(),
    retry: 1,
    staleTime: 60 * 1000,
  });
  const uncelebrated = (milestonesQ.data ?? []).find((m) => !m.celebrated);
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Reset dismissal when a new uncelebrated milestone arrives.
  useEffect(() => {
    if (uncelebrated && dismissed !== uncelebrated.id) {
      // keep dismissed as-is; new arrival will re-show if the id changes
    }
  }, [uncelebrated, dismissed]);

  const celebrate = useMutation({
    mutationFn: (id: string) => clientsApi.celebrateMilestone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'milestones'] });
    },
  });

  if (!uncelebrated || dismissed === uncelebrated.id) return null;

  function close() {
    setDismissed(uncelebrated!.id);
    celebrate.mutate(uncelebrated!.id);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
        onClick={close}
      >
        {/* Confetti — pure CSS dots floating up */}
        <ConfettiBurst />
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md overflow-hidden rounded-3xl border border-amber-400/30 bg-gradient-to-br from-amber-500/15 via-rose-500/10 to-fuchsia-500/15 p-8 text-center shadow-2xl"
        >
          <button type="button" onClick={close}
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-foreground/65 hover:bg-foreground/[0.05]"
            aria-label="Close"><X className="h-4 w-4" /></button>
          <Trophy className="mx-auto h-12 w-12 text-amber-500" />
          <h2 className={cn('mt-4 text-3xl font-semibold tracking-tight')}>
            {milestoneTitle(uncelebrated.kind, uncelebrated.value)}
          </h2>
          <p className="mt-2 text-sm text-foreground/75">
            {uncelebrated.message ?? 'Take the moment.'}
          </p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.55)]"
            >
              Keep going
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ConfettiBurst() {
  // 20 floating dots, deterministic positions to avoid Date.now/Math.random.
  const dots = Array.from({ length: 20 }, (_, i) => ({
    left: (i * 53) % 100,
    delay: (i % 8) * 0.1,
    hue: ['#3b82f6', '#a855f7', '#ec4899', '#f59e0b', '#10b981'][i % 5],
  }));
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {dots.map((d, i) => (
        <motion.span
          key={i}
          initial={{ y: '110vh', opacity: 0 }}
          animate={{ y: '-10vh', opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.5, delay: d.delay, ease: 'easeOut' }}
          className="absolute h-2 w-2 rounded-full"
          style={{ left: `${d.left}%`, backgroundColor: d.hue }}
        />
      ))}
    </div>
  );
}

function milestoneTitle(kind: string, value: number | null): string {
  if (kind === 'weight_lost_kg' && value != null) return `${value} kg down.`;
  if (kind === 'waist_lost_in' && value != null) return `${value} inches off your waist.`;
  if (kind === 'streak_days'  && value != null) return `${value}-day streak!`;
  if (kind === 'goal_reached')                  return 'Goal reached.';
  return 'Milestone!';
}