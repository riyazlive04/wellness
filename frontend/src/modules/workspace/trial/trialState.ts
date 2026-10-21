import { useScope, type Scope } from '@/hooks/useScope';

/**
 * Free-trial maths, shared by the trial dialogs and the sidebar countdown.
 *
 * Days are counted as calendar days in IST, the same way the server counts
 * them, so this never disagrees with the admin screen or the reminder emails.
 *
 * `trial_ends_at` is set when the practice is approved (the trial length is a
 * platform setting, and extendable by a super admin); the backend sends it as
 * `scope.trialEndsAt` while the workspace is still on the trial plan, so every
 * count here agrees with what billing thinks.
 */

const DAY_MS = 86_400_000;

/**
 * Calendar days between two instants, counted in India, where the practices
 * are. The server counts the same way, so the banner and the admin screen
 * cannot disagree.
 */
function istDaysBetween(from: Date, to: Date): number {
  const istDay = (d: Date) =>
    Math.floor((d.getTime() + 5.5 * 3600_000) / DAY_MS); // IST = UTC+5:30, no DST
  return istDay(to) - istDay(from);
}

export interface TrialState {
  /** Workspace is on the free trial (paid plans send no trial date). */
  onTrial: boolean;
  /** Days remaining, rounded up: the full trial length on day one, 1 on the final day. */
  daysLeft: number;
  /** The trial's last moment has passed. */
  expired: boolean;
  endsAt: Date | null;
}

export function trialStateFrom(scope: Scope | undefined): TrialState {
  const iso = scope?.trialEndsAt;
  if (!iso) return { onTrial: false, daysLeft: 0, expired: false, endsAt: null };
  const endsAt = new Date(iso);
  if (Number.isNaN(endsAt.getTime())) {
    return { onTrial: false, daysLeft: 0, expired: false, endsAt: null };
  }
  const msLeft = endsAt.getTime() - Date.now();
  return {
    onTrial: true,
    // Calendar days, not elapsed time rounded up: a trial ending 23:59 tonight
    // has "1 day" left, and Math.ceil on 3.4 days read 4 while the server
    // said 3.
    daysLeft: Math.max(0, istDaysBetween(new Date(), endsAt)),
    expired: msLeft <= 0,
    endsAt,
  };
}

export function useTrialState(): TrialState {
  const { data: scope } = useScope();
  return trialStateFrom(scope);
}

/** Human phrase for the remaining time — "5 days left", "Last day". */
export function trialPhrase({ daysLeft, expired }: TrialState) {
  if (expired) return 'Trial ended';
  if (daysLeft <= 1) return 'Last day of your trial';
  return `${daysLeft} days left in your trial`;
}
