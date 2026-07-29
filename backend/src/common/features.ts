import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Plan-gated feature catalog (SIRAH LIFE entitlement layer).
 *
 * This is the third access axis, orthogonal to the other two:
 *   - PlanLimits (billing/plans.ts) gate QUANTITY  (how many clients / AI calls)
 *   - RBAC permissions (auth/permissions.ts) gate by ROLE (what a role may do)
 *   - Features (here) gate by PLAN            (what a tier includes at all)
 *
 * A route is gated with @RequireFeature('x') and enforced by FeaturesGuard,
 * which resolves the workspace's plan and checks PLAN_FEATURES. Keep this map
 * in sync with the frontend mirror (frontend/src/lib/planCapabilities.ts).
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

/** Human labels for upsell messaging. */
const FEATURE_LABELS: Record<Feature, string> = {
  calorie_counting: 'Calorie counting',
  appointments: 'Appointments',
  comprehensive_assessment: 'Comprehensive assessment',
  community: 'Community',
  recipes: 'Recipes',
  ai_assistant: 'AI Assistant',
  organizations: 'Organizations',
  automation: 'Automation',
  analytics: 'Analytics dashboard',
  revenue_analytics: 'Revenue analytics',
  audit_logs: 'Audit logs',
};

// ── Sellable tiers (2026 pricing sheet) ───────────────────────────────
// Starter ships the food diary + AI Plate Scanner, so it needs calorie_counting.
const STARTER_FEATURES: Feature[] = ['calorie_counting'];

// Growth adds booking/video, assessments, community, the AI assistant, plus
// Automation and the Analytics dashboard (matches the pricing card).
const GROWTH_FEATURES: Feature[] = [
  ...STARTER_FEATURES,
  'appointments',
  'comprehensive_assessment',
  'community',
  'ai_assistant',
  'automation',
  'analytics',
];

// Scale Pro adds the recipe library, multi-branch organizations, and the two
// clinic-grade analytics surfaces (revenue breakdown + audit/activity log).
const SCALE_PRO_FEATURES: Feature[] = [
  ...GROWTH_FEATURES,
  'recipes',
  'organizations',
  'revenue_analytics',
  'audit_logs',
];

// ── Retired tiers — kept so grandfathered subscribers keep what they bought ──
// Automation, analytics, revenue and audit were NEVER plan-gated before, so
// every legacy subscriber already had all four. Grandfather them fully so this
// change never takes a feature away from an existing customer (Option B).
const LEGACY_GRANDFATHERED: Feature[] = ['automation', 'analytics', 'revenue_analytics', 'audit_logs'];
const PRO_FEATURES: Feature[] = [
  'calorie_counting',
  'appointments',
  'comprehensive_assessment',
  'community',
];
const ELITE_FEATURES: Feature[] = [...PRO_FEATURES, 'recipes', 'ai_assistant', 'organizations'];

/**
 * Plan key → features it unlocks. `trial` mirrors Growth (the mid tier) so
 * evaluators try the "most popular" feature set. Unknown / lapsed plans fall
 * back to trial, matching how limitsForPlan() falls back to TRIAL_LIMITS.
 */
export const PLAN_FEATURES: Record<string, Feature[]> = {
  // sellable
  starter: STARTER_FEATURES,
  growth: GROWTH_FEATURES,
  scale_pro: SCALE_PRO_FEATURES,
  // legacy (grandfathered — keep everything they already had, incl. the four
  // formerly-ungated surfaces; do not otherwise re-map onto the new tiers)
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
 * Thrown when a workspace's plan doesn't include a requested feature. Surfaces
 * as HTTP 402 with a structured body — same shape family as PlanLimitException,
 * so the frontend's upgrade-CTA handling covers both.
 */
export class FeatureLockedException extends HttpException {
  constructor(feature: Feature, plan: string) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'Feature not available on plan',
        code: 'feature_locked',
        feature,
        plan,
        message: `The ${plan} plan doesn't include ${FEATURE_LABELS[feature]}. Upgrade to unlock it.`,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
