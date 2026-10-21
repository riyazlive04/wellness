import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarClock, X } from 'lucide-react';

import { useScope } from '@/hooks/useScope';
import { cn } from '@/lib/utils';
import { trialStateFrom } from './trialState';

const DISMISS_KEY = 'nusi:trial-banner-dismissed';
const today = () => new Date().toISOString().slice(0, 10);

function dismissedToday(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === today(); } catch { return false; }
}

/**
 * A standing countdown while the trial runs, so the end date is never a
 * surprise — the practice also gets an email and a WhatsApp message at 7, 3
 * and 1 days (TrialService), but this is the one they cannot miss.
 *
 * In the last three days it stops being dismissible: at that point the next
 * thing that happens is a locked practice, and hiding it would not be a
 * kindness. Before then, dismissing hides it until tomorrow.
 */
export function TrialBanner() {
  const { data: scope } = useScope();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(dismissedToday);
  const trial = trialStateFrom(scope);

  // The expired case belongs to TrialExpiredLock, which covers the whole screen.
  if (!trial.onTrial || trial.expired) return null;
  if (scope?.isSuperAdmin) return null;
  if (pathname.startsWith('/billing')) return null;

  const urgent = trial.daysLeft <= 3;
  if (dismissed && !urgent) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, today()); } catch { /* private mode */ }
    setDismissed(true);
  };

  const canPay = (scope?.permissions ?? []).includes('billing.manage') || scope?.workspaceRole === 'owner';
  const endsOn = trial.endsAt?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 text-xs md:px-6',
        urgent
          ? 'bg-rose-500/15 text-rose-800 dark:text-rose-200'
          : 'bg-teal-500/15 text-teal-900 dark:text-teal-200',
      )}
    >
      <CalendarClock className="h-4 w-4 flex-shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">
          {trial.daysLeft <= 1
            ? 'Your trial ends today.'
            : `Your trial ends in ${trial.daysLeft} days${endsOn ? ` — ${endsOn}` : ''}.`}
        </span>{' '}
        {canPay
          ? 'Subscribe to keep your clients, plans and AI without interruption.'
          : 'Ask the practice owner to choose a plan before then.'}
      </span>
      {canPay && (
        <Link
          to="/billing"
          className={cn(
            'flex-shrink-0 rounded-full px-3 py-1 font-semibold transition-colors',
            urgent ? 'bg-rose-500/25 hover:bg-rose-500/40' : 'bg-teal-500/30 hover:bg-teal-500/45',
          )}
        >
          Choose a plan
        </Link>
      )}
      {/* No way out in the last three days — the next step is a locked practice. */}
      {!urgent && (
        <button
          type="button"
          onClick={dismiss}
          className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full opacity-70 hover:bg-foreground/10 hover:opacity-100"
          aria-label="Hide until tomorrow"
          title="Hide until tomorrow"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
