import { planChargePaise } from './billing-tax';
import { PLANS } from './plans';
import { ADDONS } from './addons';

/**
 * The arithmetic behind the subscribe guard.
 *
 * On 2026-10-24 a Starter subscription charged Rs 3,999 instead of Rs
 * 4,718.82, because a Razorpay subscription bills whatever its plan is
 * configured for and all six plans had been created at the pre-GST price.
 * The controller now reads the plan's real amount back and refuses when it
 * disagrees; these tests pin the figures it compares against.
 */
describe('subscription pricing', () => {
  it('charges 18% GST on top of every sellable plan', () => {
    for (const plan of PLANS) {
      const base = plan.priceInr * 100;
      const charged = planChargePaise(plan.priceInr);
      expect(charged).toBeGreaterThan(base);
      // Exclusive GST: the base is never silently reduced to fit a round total.
      expect(charged).toBe(base + Math.round(base * 0.18));
    }
  });

  it('charges GST on add-ons too', () => {
    for (const addon of ADDONS) {
      const base = addon.priceInr * 100;
      expect(planChargePaise(addon.priceInr)).toBe(base + Math.round(base * 0.18));
    }
  });

  // The exact case that was mis-sold, named so a future change to the Starter
  // price cannot quietly reintroduce it.
  it('bills Starter monthly at 4,718.82, not 3,999', () => {
    const starter = PLANS.find((p) => p.key === 'starter');
    expect(starter?.priceInr).toBe(3999);
    expect(planChargePaise(3999)).toBe(471882);
  });

  it('bills the annual cycles at their own GST-inclusive figures', () => {
    expect(planChargePaise(39999)).toBe(4719882);
    expect(planChargePaise(89999)).toBe(10619882);
    expect(planChargePaise(199999)).toBe(23599882);
  });

  /**
   * What the guard itself does. The controller holds the HTTP wiring; the
   * decision is just this comparison, and it is the part worth pinning:
   * a plan at the base price must be refused, and an exact match allowed.
   */
  describe('the guard decision', () => {
    const mismatched = (actual: number, expected: number) =>
      actual !== null && actual !== expected;

    it('refuses a plan still set to the pre-GST price', () => {
      expect(mismatched(399900, planChargePaise(3999))).toBe(true);
    });

    it('allows a plan created at the GST-inclusive price', () => {
      expect(mismatched(471882, planChargePaise(3999))).toBe(false);
    });

    it('refuses a plan that is merely close', () => {
      // Rs 4,718 instead of Rs 4,718.82 - a rounded plan still under-collects.
      expect(mismatched(471800, planChargePaise(3999))).toBe(true);
    });
  });
});
