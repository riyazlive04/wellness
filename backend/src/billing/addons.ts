/**
 * Recurring add-ons — the "Powerful add-ons (pay only for what you need)" strip
 * on the pricing sheet.
 *
 * These are RECURRING (monthly), unlike TOPUPS in plans.ts which are one-time
 * packs. Each add-on is its own Razorpay subscription so it can be cancelled
 * independently of the base plan.
 *
 * An add-on is only meaningful if something enforces it — every `grants` value
 * here must be honoured by LimitsService.effectiveLimits() (quantities) or the
 * capability resolver (feature flags). Adding a key here without wiring the
 * grant means selling the customer nothing.
 */

export type AddonKey =
  | 'extra_clients_100'
  | 'extra_team_member'
  | 'whatsapp_api'
  | 'custom_domain'
  | 'white_label';

/** Capability unlocked by a feature-style add-on. */
export type AddonFeature = 'whatsapp_api' | 'custom_domain' | 'white_label';

export interface AddonDescriptor {
  key: AddonKey;
  name: string;
  /** Price per unit, per month, in INR. */
  priceInr: number;
  /** Env var holding the recurring Razorpay plan id for this add-on. */
  razorpayPlanIdEnv: string;
  description: string;
  /** Whether a workspace can buy more than one (quantity on the subscription). */
  quantifiable: boolean;
  /** What ONE unit grants. Quantity multiplies the numeric grants. */
  grants: {
    /** Extra active-client slots per unit. */
    maxClients?: number;
    /** Extra team seats per unit. */
    maxTeam?: number;
    /** Capability unlocked (not multiplied by quantity). */
    feature?: AddonFeature;
  };
  /**
   * Plans that already include this — never sell it to them. e.g. Scale Pro
   * ships White Label, so only Growth should ever see that add-on.
   */
  includedInPlans?: string[];
}

export const ADDONS: AddonDescriptor[] = [
  {
    key: 'extra_clients_100',
    name: 'Extra 100 clients',
    priceInr: 999,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_ADDON_CLIENTS_100',
    description: 'Raise your client cap by 100 for as long as the add-on is active.',
    quantifiable: true,
    grants: { maxClients: 100 },
  },
  {
    key: 'extra_team_member',
    name: 'Extra team member',
    priceInr: 499,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_ADDON_TEAM_SEAT',
    description: 'One additional staff seat in your workspace.',
    quantifiable: true,
    grants: { maxTeam: 1 },
  },
  {
    key: 'whatsapp_api',
    name: 'WhatsApp API',
    priceInr: 999,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_ADDON_WHATSAPP',
    description: 'Send client messages and broadcasts over the WhatsApp Business API.',
    quantifiable: false,
    grants: { feature: 'whatsapp_api' },
  },
  {
    key: 'custom_domain',
    name: 'Custom domain',
    priceInr: 499,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_ADDON_DOMAIN',
    description: 'Serve your client portal from your own domain.',
    quantifiable: false,
    grants: { feature: 'custom_domain' },
  },
  {
    key: 'white_label',
    name: 'White label',
    priceInr: 2999,
    razorpayPlanIdEnv: 'RAZORPAY_PLAN_ID_ADDON_WHITE_LABEL',
    description: 'Remove NUSI branding from the client portal and invoices.',
    quantifiable: false,
    grants: { feature: 'white_label' },
    // Scale Pro (and legacy Elite) already include white-label.
    includedInPlans: ['scale_pro', 'elite'],
  },
];

export function findAddon(key: string): AddonDescriptor | undefined {
  return ADDONS.find((a) => a.key === key);
}

/** Add-ons a plan can actually buy (hides what the plan already includes). */
export function addonsForPlan(plan: string | null | undefined): AddonDescriptor[] {
  const p = (plan ?? '').toLowerCase();
  return ADDONS.filter((a) => !a.includedInPlans?.includes(p));
}

/** A workspace's active add-on, as stored in public.workspace_addons. */
export interface ActiveAddon {
  key: AddonKey;
  quantity: number;
}

/** Total extra client slots / team seats granted by the active add-ons. */
export function addonGrants(active: ActiveAddon[]): {
  extraClients: number;
  extraTeam: number;
  features: Set<AddonFeature>;
} {
  let extraClients = 0;
  let extraTeam = 0;
  const features = new Set<AddonFeature>();
  for (const a of active) {
    const d = findAddon(a.key);
    if (!d) continue;
    const qty = d.quantifiable ? Math.max(1, a.quantity) : 1;
    if (d.grants.maxClients) extraClients += d.grants.maxClients * qty;
    if (d.grants.maxTeam) extraTeam += d.grants.maxTeam * qty;
    if (d.grants.feature) features.add(d.grants.feature);
  }
  return { extraClients, extraTeam, features };
}
