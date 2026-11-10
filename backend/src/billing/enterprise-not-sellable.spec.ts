import { ENTERPRISE_CARD, PLANS, findPlan, limitsForPlan, sellablePlans, TRIAL_LIMITS } from './plans';
import { PublicPlansController } from './public-plans.controller';
import { WorkspaceBillingController } from './workspace-billing.controller';

/**
 * Acceptance criteria 5 and 6 of build-docs/features/enterprise-plan.md.
 *
 * Enterprise is a marketing card, not a plan key. If someone moves it into
 * PLANS, checkout would 500 on a missing Razorpay plan id and limitsForPlan
 * would start handing out unlimited quotas. These tests fail first instead.
 */
describe('Enterprise is quoted, not sellable', () => {
  it('criterion 5: is not resolvable as a plan key', () => {
    expect(findPlan('enterprise')).toBeUndefined();
  });

  it('criterion 5: sellable catalogue stays at three tiers', () => {
    expect(sellablePlans()).toHaveLength(3);
    expect(sellablePlans().map((p) => p.key)).toEqual(['starter', 'growth', 'scale_pro']);
  });

  it('criterion 5: no plan carries an enterprise key', () => {
    expect(PLANS.some((p) => p.key === ('enterprise' as never))).toBe(false);
  });

  it('falls back to trial limits rather than granting anything', () => {
    expect(limitsForPlan('enterprise')).toEqual(TRIAL_LIMITS);
  });

  it('has no Razorpay plan id to charge against', () => {
    expect(ENTERPRISE_CARD).not.toHaveProperty('razorpayPlanIdEnv');
    expect(ENTERPRISE_CARD).not.toHaveProperty('priceInr');
  });

  it('criterion 6: public endpoint serves it beside the three plans', () => {
    const { data } = new PublicPlansController().list();
    expect(data.plans).toHaveLength(3);
    expect(data.enterprise).toBeTruthy();
    expect(data.enterprise.priceLabel).toBe('Quoted');
    // String-widened: PlanKey has no 'enterprise' member today, and this must
    // keep guarding at runtime if someone adds one.
    expect(data.plans.some((p) => String(p.key) === 'enterprise')).toBe(false);
  });

  it('criterion 8: the signed-in catalogue serves it beside the three plans', () => {
    // Same guarantee as the public endpoint: the billing page's plan tiles all
    // drive Razorpay checkout, so Enterprise must never arrive inside `plans`.
    const controller = Object.create(WorkspaceBillingController.prototype) as WorkspaceBillingController;
    (controller as unknown as { razorpay: unknown }).razorpay = { keyId: null, isConfigured: () => false };
    const res = controller.listPlans();
    expect(res.plans).toHaveLength(3);
    expect(res.enterprise).toBe(ENTERPRISE_CARD);
    expect(res.plans.some((p) => String(p.key) === 'enterprise')).toBe(false);
  });

  it('criterion 3: its CTA carries the enterprise intent into the booking form', () => {
    expect(ENTERPRISE_CARD.ctaHref).toBe('/booking-page?intent=enterprise');
    expect(ENTERPRISE_CARD.ctaLabel).toBe('Contact sales');
  });
});
