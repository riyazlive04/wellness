/**
 * Mirror of the backend plan-capability rules (backend/src/common/
 * plan-capabilities.ts). Used to lock/unlock plan-gated controls in the UI;
 * the server still enforces the real check.
 */

/** Plans allowed to remove SIRAH branding (client portal + invoices). */
export const WHITE_LABEL_PLANS = ['enterprise'];

export function canWhiteLabel(plan?: string | null): boolean {
  return !!plan && WHITE_LABEL_PLANS.includes(plan.toLowerCase());
}
