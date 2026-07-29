/**
 * Frontend feature gating.
 *
 * The BACKEND is the single source of truth: `/auth/me/scope` returns the
 * resolved `features[]` for the workspace's plan, computed by the very map its
 * FeaturesGuard enforces (backend/src/common/features.ts). Read that list via
 * `featuresOf(scope)` — do NOT re-derive entitlements from the plan key.
 *
 * Why: this file used to carry a hand-copied plan→feature map, and it drifted.
 * It never learned the 2026 keys (starter/growth/scale_pro), so every sellable
 * plan fell through to the `trial` fallback and gated the wrong things — the AI
 * Assistant was hidden from Growth customers who had paid for it and whose
 * pricing card advertised it, while a Recipes tab they did NOT have was shown
 * and 402'd on every call. Two maps that must agree will eventually not.
 *
 * The map below survives only as a fallback for the deploy window, where a new
 * frontend can briefly talk to a backend that doesn't send `features` yet.
 */

export const FEATURES = [
  'calorie_counting',
  'appointments',
  'comprehensive_assessment',
  'community',
  'recipes',
  'ai_assistant',
  'organizations',
  'automation',
  'analytics',
  'revenue_analytics',
  'audit_logs',
] as const;

export type Feature = (typeof FEATURES)[number];

function isFeature(x: string): x is Feature {
  return (FEATURES as readonly string[]).includes(x);
}

/**
 * The features a scope unlocks. Prefers the server-resolved list; falls back to
 * the local map only when the backend predates that field.
 */
export function featuresOf(
  scope?: { features?: string[]; plan?: string | null; isSuperAdmin?: boolean } | null,
): Feature[] {
  if (scope?.features) return scope.features.filter(isFeature);
  if (scope?.isSuperAdmin) return [...FEATURES];
  return featuresForPlan(scope?.plan);
}

// ── Fallback only — see the header. Mirrors backend/src/common/features.ts. ──

const STARTER_FEATURES: Feature[] = ['calorie_counting'];
const GROWTH_FEATURES: Feature[] = [
  ...STARTER_FEATURES,
  'appointments',
  'comprehensive_assessment',
  'community',
  'ai_assistant',
  'automation',
  'analytics',
];
const SCALE_PRO_FEATURES: Feature[] = [
  ...GROWTH_FEATURES,
  'recipes',
  'organizations',
  'revenue_analytics',
  'audit_logs',
];

// Retired tiers — grandfathered subscribers keep what they bought, plus the
// four formerly-ungated surfaces (automation/analytics/revenue/audit) so this
// gating never takes anything away from an existing customer (Option B).
const LEGACY_GRANDFATHERED: Feature[] = ['automation', 'analytics', 'revenue_analytics', 'audit_logs'];
const PRO_FEATURES: Feature[] = [
  'calorie_counting',
  'appointments',
  'comprehensive_assessment',
  'community',
];
const ELITE_FEATURES: Feature[] = [...PRO_FEATURES, 'recipes', 'ai_assistant', 'organizations'];

export const PLAN_FEATURES: Record<string, Feature[]> = {
  // sellable (2026 pricing sheet)
  starter: STARTER_FEATURES,
  growth: GROWTH_FEATURES,
  scale_pro: SCALE_PRO_FEATURES,
  // legacy (grandfathered — keep what they had, incl. the four ungated ones)
  basic: [...LEGACY_GRANDFATHERED],
  pro: [...PRO_FEATURES, ...LEGACY_GRANDFATHERED],
  elite: [...ELITE_FEATURES, ...LEGACY_GRANDFATHERED],
  trial: GROWTH_FEATURES,
};

export function featuresForPlan(plan?: string | null): Feature[] {
  if (!plan) return PLAN_FEATURES.trial;
  return PLAN_FEATURES[plan.toLowerCase()] ?? PLAN_FEATURES.trial;
}

export function planHasFeature(plan: string | null | undefined, feature: Feature): boolean {
  return featuresForPlan(plan).includes(feature);
}

/**
 * Plans allowed to remove SIRAH LIFE branding (client portal + invoices).
 * Mirrors backend/src/common/plan-capabilities.ts — white-label is a plan
 * capability rather than a gated Feature, so it isn't carried on scope.
 */
export const WHITE_LABEL_PLANS = ['scale_pro', 'elite'];

export function canWhiteLabel(plan?: string | null): boolean {
  return !!plan && WHITE_LABEL_PLANS.includes(plan.toLowerCase());
}
