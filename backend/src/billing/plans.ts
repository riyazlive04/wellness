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
export type PlanKey = 'starter' | 'pro' | 'scale' | 'enterprise';
export type TopupKey = 'ai_calls_1k' | 'ai_calls_5k' | 'clients_extra_25';

export interface PlanDescriptor {
  key: PlanKey;
  name: string;
  priceInr: number;
  /** What the env var that holds the Razorpay plan_id should be called. */
  razorpayPlanIdEnv: string;
  tagline: string;
  features: string[];
  recommended?: boolean;
}

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
    key: 'starter',
    name: 'Starter',
    priceInr: 999,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_STARTER',
    tagline: 'Solo practitioner getting started',
    features: [
      'Up to 25 clients',
      '1,000 AI calls / month',
      'Voice AI included',
      'Plate Vision (50/month)',
      'Email support',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    priceInr: 1999,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_PRO',
    tagline: 'Established solo practice',
    features: [
      'Up to 100 clients',
      '5,000 AI calls / month',
      'Voice + Vision unlimited',
      'Team of 3',
      'Priority support',
    ],
    recommended: true,
  },
  {
    key: 'scale',
    name: 'Scale',
    priceInr: 2999,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_SCALE',
    tagline: 'Small clinic with a team',
    features: [
      'Up to 300 clients',
      '15,000 AI calls / month',
      'Custom workflows',
      'Team of 10',
      'Phone + WhatsApp support',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    priceInr: 3999,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_ENTERPRISE',
    tagline: 'Multi-coach clinic',
    features: [
      'Unlimited clients',
      '50,000 AI calls / month',
      'White-label invoices',
      'Priority AI compute',
      'Dedicated success manager',
    ],
  },
];

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