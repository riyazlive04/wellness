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
export type PlanKey = 'basic' | 'pro' | 'elite';
export type TopupKey = 'ai_calls_1k' | 'ai_calls_5k' | 'clients_extra_25';

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

export const PLANS: PlanDescriptor[] = [
  {
    key: 'basic',
    name: 'Basic',
    priceInr: 5000,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_BASIC',
    tagline: 'Solo practitioner getting started',
    features: [
      'Up to 50 clients',
      'Team of 3',
      '3,000 AI calls / month',
      'Client CRM, programs & messaging',
      'Food library & assessments',
      'Voice + Vision AI',
      'Email support',
    ],
    limits: { maxClients: 50, maxTeam: 3, maxManagers: 0, aiCallsPerMonth: 3000, maxStorageBytes: 10 * GB },
  },
  {
    key: 'pro',
    name: 'Pro',
    priceInr: 10000,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_PRO',
    tagline: 'Established practice with a team',
    features: [
      'Everything in Basic, plus:',
      'Up to 150 clients · 1 manager',
      'Team of 8',
      '12,000 AI calls / month',
      'Appointments + video calls',
      'Plate Vision calorie tracking',
      'Comprehensive assessments',
      'Community feed',
      'Priority support',
    ],
    limits: { maxClients: 150, maxTeam: 8, maxManagers: 1, aiCallsPerMonth: 12000, maxStorageBytes: 50 * GB },
    recommended: true,
  },
  {
    key: 'elite',
    name: 'Elite',
    priceInr: 15000,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_ELITE',
    tagline: 'Multi-coach clinic at scale',
    features: [
      'Everything in Pro, plus:',
      'Unlimited clients & team',
      '4 manager seats',
      '40,000 AI calls / month',
      'Recipes library',
      'AI Assistant (Gemini)',
      'Multi-workspace organizations',
      'White-label portal & invoices',
      'Dedicated success manager',
    ],
    limits: { maxClients: null, maxTeam: null, maxManagers: 4, aiCallsPerMonth: 40000, maxStorageBytes: 200 * GB },
  },
];

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

export const TOPUPS: TopupDescriptor[] = [
  {
    key: 'ai_calls_1k',
    name: '+1,000 AI calls',
    priceInr: 199,
    units: 1000,
    unitLabel: 'calls',
    description: 'Top up your AI quota for the current billing cycle.',
  },
  {
    key: 'ai_calls_5k',
    name: '+5,000 AI calls',
    priceInr: 799,
    units: 5000,
    unitLabel: 'calls',
    description: 'Bulk discount on AI calls — saves vs. 5× the smaller pack.',
  },
  {
    key: 'clients_extra_25',
    name: '+25 client slots',
    priceInr: 499,
    units: 25,
    unitLabel: 'clients',
    description: 'Lift the cap on your current plan by 25 active clients.',
  },
];

export function findPlan(key: string): PlanDescriptor | undefined {
  return PLANS.find((p) => p.key === key);
}

export function findTopup(key: string): TopupDescriptor | undefined {
  return TOPUPS.find((t) => t.key === key);
}