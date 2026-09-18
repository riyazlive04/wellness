import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, Lock, Sparkles, X } from 'lucide-react';

import { Glass } from '@/design-system';
import { useScope } from '@/hooks/useScope';
import { trialPhrase, trialStateFrom } from './trialState';

/**
 * Free-trial countdown, daily reminder and end-of-trial lock.
 *
 * `trial_ends_at` is set to signup + 14 days by the database; the backend sends
 * it as `scope.trialEndsAt` while the workspace is still on the trial plan.
 * Everything here derives from that single timestamp, so the count can't drift
 * from what billing thinks.
 *
 * - Days left counts whole days remaining, so the day the trial ends reads
 *   "last day" rather than a confusing "0 days left".
 * - The reminder appears once per calendar day, per user (remembered in
 *   localStorage), and never on the billing page itself.
 * - When the trial is over the workspace is locked to the billing page until a
 *   plan is chosen. Super admins are never locked.
 *
 * Note: this is the UI half. The backend still serves API data to an expired
 * trial, so this deters rather than enforces - server-side enforcement is a
 * separate change in FeaturesGuard.
 */

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Once-a-day nudge while the trial runs. Shown after a short delay so it never
 * competes with the page load, and skipped on /billing where it would be noise.
 */
export function TrialReminder() {
  const { data: scope } = useScope();
  const trial = trialStateFrom(scope);
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  const storageKey = scope?.userId ? `nusi:trial-reminder:${scope.userId}` : null;

  useEffect(() => {
    if (!trial.onTrial || trial.expired || !storageKey) return;
    if (pathname.startsWith('/billing')) return;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(storageKey);
    } catch {
      /* private mode - just show it this session */
    }
    if (seen === todayKey()) return;
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, [trial.onTrial, trial.expired, storageKey, pathname]);

  function dismiss() {
    setOpen(false);
    try {
      if (storageKey) localStorage.setItem(storageKey, todayKey());
    } catch {
      /* ignore - it will simply show again next load */
    }
  }

  if (!trial.onTrial || trial.expired) return null;

  const urgent = trial.daysLeft <= 3;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Free trial reminder"
          onClick={dismiss}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md"
          >
            <Glass variant="heavy" className="relative overflow-hidden p-7 text-center">
              <button
                type="button"
                onClick={dismiss}
                aria-label="Close"
                className="absolute right-4 top-4 rounded-full p-1.5 text-foreground/45 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>

              <span
                className={
                  'mx-auto grid h-14 w-14 place-items-center rounded-full ' +
                  (urgent
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                    : 'bg-teal-500/15 text-teal-700 dark:text-teal-300')
                }
              >
                <CalendarClock className="h-7 w-7" />
              </span>

              <h2 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
                {trialPhrase(trial)}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-foreground/65">
                {urgent
                  ? 'Choose a plan now so your clients, programs and chats keep running without a break.'
                  : 'You have full access to every feature. Pick a plan any time - your data carries straight over.'}
              </p>

              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link
                  to="/billing"
                  onClick={dismiss}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-6 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
                >
                  <Sparkles className="h-4 w-4" /> Choose a plan
                </Link>
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-full border border-foreground/15 px-6 py-3 text-sm text-foreground/75 transition-colors hover:bg-foreground/[0.04]"
                >
                  Keep exploring
                </button>
              </div>
            </Glass>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Blocks the workspace once the trial is over. Billing stays reachable so the
 * practice can pay and carry on; super admins pass through untouched.
 */
export function TrialExpiredLock() {
  const { data: scope } = useScope();
  const trial = trialStateFrom(scope);
  const { pathname } = useLocation();

  if (!trial.onTrial || !trial.expired) return null;
  if (scope?.isSuperAdmin) return null;
  if (pathname.startsWith('/billing')) return null;

  const canPay = (scope?.permissions ?? []).includes('billing.manage') || scope?.workspaceRole === 'owner';

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-canvas/85 p-4 backdrop-blur-md">
      <Glass variant="heavy" className="w-full max-w-lg p-8 text-center md:p-10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300">
          <Lock className="h-7 w-7" />
        </span>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          Your 14-day free trial has ended.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-foreground/65 md:text-base">
          Everything is safe - your clients, programs and conversations are exactly as you left
          them. Choose a plan to pick up where you stopped.
        </p>

        {canPay ? (
          <Link
            to="/billing"
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-7 py-3.5 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
          >
            <Sparkles className="h-4 w-4" /> Choose a plan
          </Link>
        ) : (
          <p className="mt-7 text-sm text-foreground/70">
            Ask the practice owner to choose a plan to restore access.
          </p>
        )}

        <p className="mt-5 text-xs text-foreground/50">
          Need more time or help moving your data? Email support@sirahdigital.in
        </p>
      </Glass>
    </div>
  );
}
