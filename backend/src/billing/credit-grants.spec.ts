import { carriedOverCredits } from './credit-grants';

/**
 * AI credit packs are valid for 30 days. Last month's usage drew on the plan
 * allowance first, so unused pack credits carry into this month while the
 * pack is still within its 30 days (they used to vanish at month end).
 */
describe('carriedOverCredits', () => {
  const base = { planMonthlyAllowance: 500 };

  it('carries a late-month pack that was barely used', () => {
    // 1,000 pack bought on the 30th; 520 calls last month -> 20 came from the pack.
    expect(carriedOverCredits({ ...base, lastMonthPacks: 1000, lastMonthPacksStillValid: 1000, usedLastMonth: 520 })).toBe(980);
  });

  it('carries nothing when the plan allowance covered no pack use and the pack has expired', () => {
    expect(carriedOverCredits({ ...base, lastMonthPacks: 1000, lastMonthPacksStillValid: 0, usedLastMonth: 100 })).toBe(0);
  });

  it('carries the whole pack when last month stayed inside the plan allowance', () => {
    expect(carriedOverCredits({ ...base, lastMonthPacks: 1000, lastMonthPacksStillValid: 1000, usedLastMonth: 300 })).toBe(1000);
  });

  it('carries nothing once the pack was used up', () => {
    expect(carriedOverCredits({ ...base, lastMonthPacks: 1000, lastMonthPacksStillValid: 1000, usedLastMonth: 1600 })).toBe(0);
  });

  it('only carries credits from packs still inside their 30 days', () => {
    // Two packs last month (1,000 early + 1,000 late); only the late one is valid.
    expect(carriedOverCredits({ ...base, lastMonthPacks: 2000, lastMonthPacksStillValid: 1000, usedLastMonth: 600 })).toBe(1000);
  });

  it('carries nothing on an unlimited plan', () => {
    expect(carriedOverCredits({ planMonthlyAllowance: null, lastMonthPacks: 1000, lastMonthPacksStillValid: 1000, usedLastMonth: 0 })).toBe(0);
  });
});
