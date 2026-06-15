/**
 * Proration for mid-cycle plan changes (Module 3 — Subscription Upgrade/Downgrade).
 *
 * When a workspace switches plans partway through a billing cycle we estimate
 * the fair money movement: credit the unused portion of the OLD plan and charge
 * the prorated portion of the NEW plan for the days remaining.
 *
 *   ratio          = daysRemaining / periodDays
 *   unusedCredit   = oldPrice * ratio        (what they've already paid but won't use)
 *   newProrated    = newPrice * ratio        (cost of the new plan for the rest of the cycle)
 *   immediateDue   = max(0, newProrated - unusedCredit)   (upgrades; >0)
 *
 * This is an ESTIMATE for the confirmation UI — the authoritative charge is
 * whatever the payment provider settles. Direction:
 *   - upgrade   (newPrice > oldPrice): change applies immediately, prorated charge now
 *   - downgrade (newPrice < oldPrice): change applies at cycle end, no charge now
 *   - same price: treated as immediate, no charge
 */

export type ChangeDirection = 'upgrade' | 'downgrade' | 'same';
export type ChangeTiming = 'now' | 'cycle_end';

export interface ProrationEstimate {
  direction: ChangeDirection;
  timing: ChangeTiming;
  oldPricePaise: number;
  newPricePaise: number;
  daysRemaining: number;
  periodDays: number;
  /** Unused value of the current plan for the remaining days (paise). */
  unusedCreditPaise: number;
  /** Cost of the new plan for the remaining days (paise). */
  newProratedPaise: number;
  /** What the customer pays now to switch (0 for downgrades / scheduled changes). */
  immediateChargePaise: number;
  /** Full price of the new plan from the next cycle onward (paise). */
  nextCyclePaise: number;
}

const DAY_MS = 86_400_000;

export function computeProration(params: {
  oldPricePaise: number;
  newPricePaise: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  now?: Date;
}): ProrationEstimate {
  const { oldPricePaise, newPricePaise } = params;
  const now = params.now ?? new Date();

  const direction: ChangeDirection =
    newPricePaise > oldPricePaise ? 'upgrade' : newPricePaise < oldPricePaise ? 'downgrade' : 'same';
  // Upgrades take effect immediately; downgrades wait until the paid period ends.
  const timing: ChangeTiming = direction === 'downgrade' ? 'cycle_end' : 'now';

  // Default to a 30-day cycle if the provider hasn't told us the window yet.
  const end = params.periodEnd ?? new Date(now.getTime() + 30 * DAY_MS);
  const start = params.periodStart ?? new Date(end.getTime() - 30 * DAY_MS);

  const periodDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
  const daysRemaining = Math.max(0, Math.min(periodDays, Math.ceil((end.getTime() - now.getTime()) / DAY_MS)));
  const ratio = periodDays > 0 ? daysRemaining / periodDays : 0;

  const unusedCreditPaise = Math.round(oldPricePaise * ratio);
  const newProratedPaise = Math.round(newPricePaise * ratio);

  // Downgrades are scheduled for cycle end → nothing due now. Upgrades charge the
  // difference between the new prorated cost and the unused credit on the old plan.
  const immediateChargePaise = timing === 'cycle_end' ? 0 : Math.max(0, newProratedPaise - unusedCreditPaise);

  return {
    direction,
    timing,
    oldPricePaise,
    newPricePaise,
    daysRemaining,
    periodDays,
    unusedCreditPaise,
    newProratedPaise,
    immediateChargePaise,
    nextCyclePaise: newPricePaise,
  };
}
