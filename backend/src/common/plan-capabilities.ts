/**
 * Single source of truth for plan-gated capabilities.
 *
 * Keep this tiny and declarative — both the write-side guard (reject enabling
 * a capability on an ineligible plan) and the render-side resolver (auto-hide
 * the capability after a downgrade) read from here, so the two can never drift.
 */

/**
 * Plans allowed to remove NUSI branding (client portal + invoices).
 * `scale_pro` is the sellable tier; `elite` is its retired predecessor, kept so
 * grandfathered subscribers don't lose white-label overnight.
 *
 * NOTE: the pricing sheet also sells White Label as a ₹2,999/mo add-on for
 * Growth. That needs the recurring `workspace_addons` model — once it exists,
 * this check must become "plan allows it OR the add-on is active".
 */
export const WHITE_LABEL_PLANS = ['scale_pro', 'elite'] as const;

export function canWhiteLabel(plan?: string | null): boolean {
  return !!plan && (WHITE_LABEL_PLANS as readonly string[]).includes(plan.toLowerCase());
}
