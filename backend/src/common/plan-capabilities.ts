/**
 * Single source of truth for plan-gated capabilities.
 *
 * Keep this tiny and declarative — both the write-side guard (reject enabling
 * a capability on an ineligible plan) and the render-side resolver (auto-hide
 * the capability after a downgrade) read from here, so the two can never drift.
 */

/** Plans allowed to remove SIRAH branding (client portal + invoices). */
export const WHITE_LABEL_PLANS = ['enterprise'] as const;

export function canWhiteLabel(plan?: string | null): boolean {
  return !!plan && (WHITE_LABEL_PLANS as readonly string[]).includes(plan.toLowerCase());
}
