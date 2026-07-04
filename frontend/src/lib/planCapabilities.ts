/**
 * Mirror of the backend plan-capability rules (backend/src/common/
 * plan-capabilities.ts). Used to lock/unlock plan-gated controls in the UI;
 * the server still enforces the real check.
 */

/** Plans allowed to remove SIRAH branding (client portal + invoices). */
export const WHITE_LABEL_PLANS = ['elite'];

export function canWhiteLabel(plan?: string | null): boolean {
  return !!plan && WHITE_LABEL_PLANS.includes(plan.toLowerCase());
}

/**
 * Mirror of the backend feature catalog (backend/src/common/features.ts).
 * Drives UI lock/hide + upgrade prompts; the server still enforces the real
 * check (routes return 402 feature_locked). Keep the two maps in sync.
 */
export const FEATURES = [
  'calorie_counting',
  'appointments',
  'comprehensive_assessment',
  'community',
  'recipes',
  'ai_assistant',
  'organizations',
] as const;

export type Feature = (typeof FEATURES)[number];

const PRO_FEATURES: Feature[] = [
  'calorie_counting',
  'appointments',
  'comprehensive_assessment',
  'community',
];

const ELITE_FEATURES: Feature[] = [
  ...PRO_FEATURES,
  'recipes',
  'ai_assistant',
  'organizations',
];

/** Plan key → unlocked features. `trial` mirrors Pro; unknown falls back to trial. */
export const PLAN_FEATURES: Record<string, Feature[]> = {
  basic: [],
  pro: PRO_FEATURES,
  elite: ELITE_FEATURES,
  trial: PRO_FEATURES,
};

export function featuresForPlan(plan?: string | null): Feature[] {
  if (!plan) return PLAN_FEATURES.trial;
  return PLAN_FEATURES[plan.toLowerCase()] ?? PLAN_FEATURES.trial;
}

export function planHasFeature(plan: string | null | undefined, feature: Feature): boolean {
  return featuresForPlan(plan).includes(feature);
}
