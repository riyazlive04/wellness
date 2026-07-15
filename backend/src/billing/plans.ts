/**
 * Canonical plan catalog.
 *
 * `price_paise` drives one-time orders (top-ups, single-month charges).
 * `razorpay_plan_id` is required for *subscription* (recurring) flow — create
 * the plan in Razorpay Dashboard → Subscriptions → Plans, then drop the
 * resulting `plan_XXXXXX` into the matching env var below.
 *
 * Keeping the plan ID in env (not hard-coded) means test mode and live mode
 * can point at different Razorpay plan IDs without code changes.
 */
/**
 * Public (sellable) plans — the 2026 pricing sheet.
 * `basic|pro|elite` are LEGACY keys kept only so existing subscribers keep their
 * original limits (see LEGACY_PLANS). They are never offered to new buyers.
 */
export type PublicPlanKey = 'starter' | 'growth' | 'scale_pro';
export type LegacyPlanKey = 'basic' | 'pro' | 'elite';
export type PlanKey = PublicPlanKey | LegacyPlanKey;
export type TopupKey = 'ai_credits_1k' | 'ai_credits_5k' | 'ai_credits_20k' | 'clients_extra_100';

/**
 * Billing automation timing (Module 3 — Renewal + Payment-Failure Recovery).
 *
 * GRACE: after a renewal charge fails (subscription goes halted/pending) the
 * workspace keeps its plan for this many days before being downgraded to trial
 * limits. RENEWAL/TRIAL reminder windows control when the scheduler nudges.
 */
export const BILLING_GRACE_DAYS = 14;
export const RENEWAL_REMINDER_DAYS = 3;
export const TRIAL_REMINDER_DAYS = 3;

/**
 * Machine-readable quotas per plan. `null` = unlimited. These are the numbers
 * the LimitsService enforces server-side (Module 2 — Subscription Management).
 * Keep them in sync with the human-readable `features` strings below.
 */
export interface PlanLimits {
  /** Max active clients + outstanding pending client invites. */
  maxClients: number | null;
  /** Max workspace team members (incl. owner) + outstanding staff invites. */
  maxTeam: number | null;
  /**
   * Max members holding the `manager` role (active + pending invites). A
   * sub-cap *inside* maxTeam. 0 = the plan cannot have managers at all.
   */
  maxManagers: number | null;
  /** AI calls (vision + voice + text) allowed per calendar month. */
  aiCallsPerMonth: number | null;
  /** Storage cap in bytes (tracked best-effort; not yet enforced on upload). */
  maxStorageBytes: number | null;
}

export interface PlanDescriptor {
  key: PlanKey;
  name: string;
  priceInr: number;
  /** What the env var that holds the Razorpay plan_id should be called. */
  razorpayPlanIdEnv: string;
  tagline: string;
  features: string[];
  limits: PlanLimits;
  recommended?: boolean;

  // ── Pricing-sheet presentation (public plans only) ──────────────────
  /** Yearly price. Null = not sold annually. Annual Razorpay plan is separate. */
  priceInrAnnual?: number | null;
  /** Env var holding the ANNUAL Razorpay plan_id. */
  razorpayPlanIdEnvAnnual?: string;
  /** One-time onboarding fee charged at signup (order, not subscription). */
  setupFeeInr?: number;
  /** What the setup fee covers — rendered under the fee. */
  setupIncludes?: string[];
  /** Marketing anchor ("Total value ₹40,000+"). Presentation only. */
  totalValueInr?: number;
  /** One-line promise shown under the price. */
  promise?: string;
  /** Card accent — drives the tier colour in the UI. */
  accent?: 'green' | 'blue' | 'purple';
  /** Hidden from pickers: kept only to resolve limits for existing subscribers. */
  legacy?: boolean;
}

const GB = 1024 * 1024 * 1024;

export interface TopupDescriptor {
  key: TopupKey;
  name: string;
  priceInr: number;
  units: number;
  unitLabel: string;
  description: string;
}

/** The sellable catalog (2026 pricing sheet). Order = display order. */
export const PLANS: PlanDescriptor[] = [
  {
    key: 'starter',
    name: 'Starter',
    priceInr: 3999,
    priceInrAnnual: 39999,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_STARTER',
    razorpayPlanIdEnvAnnual: 'RAZORPAY_PLAN_ID_STARTER_ANNUAL',
    tagline: 'For solo nutritionists',
    promise: 'Perfect to start your practice',
    accent: 'green',
    totalValueInr: 40000,
    setupFeeInr: 4999,
    setupIncludes: ['Account setup', 'Branding', 'Import up to 100 clients', 'Training'],
    features: [
      '100 clients',
      '1 user',
      'Unlimited programs',
      'Meal plans',
      'Food diary',
      'Habit tracking',
      'Goal tracking',
      'Progress charts',
      'Client mobile app',
      'AI Plate Scanner',
      'Barcode scanner',
      'Client chat',
      'Reports',
      'WhatsApp notifications',
      '5 GB storage',
      'Email support',
    ],
    limits: { maxClients: 100, maxTeam: 1, maxManagers: 0, aiCallsPerMonth: 500, maxStorageBytes: 5 * GB },
  },
  {
    key: 'growth',
    name: 'Growth',
    priceInr: 8999,
    priceInrAnnual: 89999,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_GROWTH',
    razorpayPlanIdEnvAnnual: 'RAZORPAY_PLAN_ID_GROWTH_ANNUAL',
    tagline: 'For growing practices',
    promise: 'Grow faster. Save time. Delight clients.',
    accent: 'blue',
    totalValueInr: 90000,
    setupFeeInr: 9999,
    setupIncludes: ['Everything in Starter', 'WhatsApp setup', 'Automation setup', 'Templates'],
    features: [
      '500 clients',
      '5 team members',
      'Online appointment booking',
      'Video consultation',
      'AI Nutrition Assistant',
      'AI progress summary',
      'Community groups',
      'Assessments',
      'Automation',
      'Analytics dashboard',
      'Unlimited reports',
      // NOTE: deliberately NOT "unlimited AI plate analysis" — a plate scan is
      // an AI call, and 1 credit = 1 AI call, so scans draw down the 5,000
      // monthly credits like any other AI use. Promising unlimited here would
      // contradict the meter that actually enforces it.
      'WhatsApp broadcast',
      'Priority support',
      '50 GB storage',
      'All Starter features',
    ],
    limits: { maxClients: 500, maxTeam: 5, maxManagers: 1, aiCallsPerMonth: 5000, maxStorageBytes: 50 * GB },
    recommended: true,
  },
  {
    key: 'scale_pro',
    name: 'Scale Pro',
    priceInr: 19999,
    priceInrAnnual: 199999,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_SCALE_PRO',
    razorpayPlanIdEnvAnnual: 'RAZORPAY_PLAN_ID_SCALE_PRO_ANNUAL',
    tagline: 'For clinics & multi-coach centers',
    promise: 'Scale without limits. Build a brand.',
    accent: 'purple',
    totalValueInr: 250000,
    setupFeeInr: 24999,
    setupIncludes: ['White-label setup', 'Data migration', 'Staff training', 'Priority go-live'],
    features: [
      'Unlimited clients',
      'Unlimited team members',
      'Multi-branch support',
      'Organization dashboard',
      'White Label app',
      'Custom branding',
      'AI Executive Assistant',
      'AI Team Assistant',
      'Recipe management',
      'Franchise dashboard',
      'Revenue analytics',
      'Staff permissions',
      'Audit logs',
      'API access',
      'Premium support',
      'Dedicated success manager',
      '200 GB storage',
      'All Growth features',
    ],
    limits: { maxClients: null, maxTeam: null, maxManagers: null, aiCallsPerMonth: 25000, maxStorageBytes: 200 * GB },
  },
];

/**
 * Retired tiers, kept ONLY so workspaces already subscribed to them keep their
 * original quotas. Never shown in a picker (`legacy: true`) and never sold.
 *
 * Do NOT map these onto the new tiers: old Basic allowed a team of 3 while new
 * Starter allows 1, so a naive remap would put existing workspaces over their
 * limit overnight. Grandfather instead; migrate deliberately, per customer.
 */
export const LEGACY_PLANS: PlanDescriptor[] = [
  {
    key: 'basic',
    name: 'Basic (legacy)',
    priceInr: 5000,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_BASIC',
    tagline: 'Retired — grandfathered',
    legacy: true,
    features: ['Up to 50 clients', 'Team of 3', '3,000 AI calls / month'],
    limits: { maxClients: 50, maxTeam: 3, maxManagers: 0, aiCallsPerMonth: 3000, maxStorageBytes: 10 * GB },
  },
  {
    key: 'pro',
    name: 'Pro (legacy)',
    priceInr: 10000,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_PRO',
    tagline: 'Retired — grandfathered',
    legacy: true,
    features: ['Up to 150 clients · 1 manager', 'Team of 8', '12,000 AI calls / month'],
    limits: { maxClients: 150, maxTeam: 8, maxManagers: 1, aiCallsPerMonth: 12000, maxStorageBytes: 50 * GB },
  },
  {
    key: 'elite',
    name: 'Elite (legacy)',
    priceInr: 15000,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_ELITE',
    tagline: 'Retired — grandfathered',
    legacy: true,
    features: ['Unlimited clients & team', '4 manager seats', '40,000 AI calls / month'],
    limits: { maxClients: null, maxTeam: null, maxManagers: 4, aiCallsPerMonth: 40000, maxStorageBytes: 200 * GB },
  },
];

/** Everything resolvable by key — sellable + grandfathered. */
export const ALL_PLANS: PlanDescriptor[] = [...PLANS, ...LEGACY_PLANS];

/**
 * Limits for a workspace still on the free trial (workspaces.plan = 'trial',
 * the default). Generous enough to evaluate, capped enough to require upgrade.
 */
export const TRIAL_LIMITS: PlanLimits = {
  maxClients: 10,
  maxTeam: 2,
  maxManagers: 1,
  aiCallsPerMonth: 500,
  maxStorageBytes: 1 * GB,
};

/**
 * Resolve the effective limits for a plan key. Unknown keys and 'trial' fall
 * back to TRIAL_LIMITS so a workspace is never accidentally unlimited.
 */
export function limitsForPlan(planKey: string | null | undefined): PlanLimits {
  const plan = planKey ? findPlan(planKey) : undefined;
  return plan ? plan.limits : TRIAL_LIMITS;
}

/**
 * One-time packs (Razorpay orders, not subscriptions) — the "AI Credits Packs"
 * on the pricing sheet. Credits are metered by `limits.aiCallsPerMonth`.
 *
 * NOTE: the sheet's other add-ons (extra team member, WhatsApp API, custom
 * domain, white label) are RECURRING and need a `workspace_addons` subscription
 * model — deliberately not modelled here, since TOPUPS are one-time by design.
 */
export const TOPUPS: TopupDescriptor[] = [
  {
    key: 'ai_credits_1k',
    name: '1,000 AI credits',
    priceInr: 999,
    units: 1000,
    unitLabel: 'credits',
    description: 'Top up your AI credits for the current billing cycle.',
  },
  {
    key: 'ai_credits_5k',
    name: '5,000 AI credits',
    priceInr: 3999,
    units: 5000,
    unitLabel: 'credits',
    description: 'Bulk pack — better value than 5× the 1,000 pack.',
  },
  {
    key: 'ai_credits_20k',
    name: '20,000 AI credits',
    priceInr: 9999,
    units: 20000,
    unitLabel: 'credits',
    description: 'Best value for high-volume AI usage.',
  },
  {
    key: 'clients_extra_100',
    name: '+100 client slots',
    priceInr: 999,
    units: 100,
    unitLabel: 'clients',
    description: 'Lift your plan’s client cap by 100 for the current cycle.',
  },
];

/**
 * Resolve ANY plan key — sellable or grandfathered. Must search legacy too:
 * an existing 'pro' subscriber whose key no longer resolved would silently fall
 * back to TRIAL_LIMITS and lose their quota.
 */
export function findPlan(key: string): PlanDescriptor | undefined {
  return ALL_PLANS.find((p) => p.key === key);
}

/** Only the plans a customer may buy — use this for pickers / upgrade CTAs. */
export function sellablePlans(): PlanDescriptor[] {
  return PLANS;
}

export function findTopup(key: string): TopupDescriptor | undefined {
  return TOPUPS.find((t) => t.key === key);
}