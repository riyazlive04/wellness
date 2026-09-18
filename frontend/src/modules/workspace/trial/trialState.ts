import { useScope, type Scope } from '@/hooks/useScope';

/**
 * Free-trial maths, shared by the trial dialogs and the sidebar countdown.
 *
 * `trial_ends_at` is signup + 14 days in the database; the backend sends it as
 * `scope.trialEndsAt` while the workspace is still on the trial plan, so every
 * count here agrees with what billing thinks.
 */

const DAY_MS = 86_400_000;

export interface TrialState {
  /** Workspace is on the free trial (paid plans send no trial date). */
  onTrial: boolean;
  /** Days remaining, rounded up: 14 on signup day, 1 on the final day. */
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
    daysLeft: Math.max(0, Math.ceil(msLeft / DAY_MS)),
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
