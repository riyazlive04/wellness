import { estimateCost } from './usage.service';

/**
 * AI cost estimates shown on the admin AI Usage page. Prices are USD per 1M
 * tokens at ₹85/$, returned in micro-INR (₹1 = 1,000,000).
 */
describe('estimateCost', () => {
  it('prices input and output tokens separately', () => {
    // gpt-4o-mini: $0.15 in, $0.60 out. 1M in + 1M out = $0.75 = ₹63.75.
    expect(estimateCost('gpt-4o-mini', 1_000_000, 1_000_000, null)).toBe(63_750_000);
  });

  it('prices OpenAI practices (no longer ₹0)', () => {
    expect(estimateCost('gpt-4o-mini', 1_000, 200, 1_200)).toBeGreaterThan(0);
    expect(estimateCost('gpt-4o-mini-transcribe', 500, 50, null)).toBeGreaterThan(0);
  });

  it('matches dated and prefixed model names to their base price', () => {
    const base = estimateCost('gpt-4o-mini', 1_000, 100, null);
    expect(estimateCost('gpt-4o-mini-2024-07-18', 1_000, 100, null)).toBe(base);
    expect(estimateCost('models/gemini-2.5-flash', 1_000, 100, null)).toBe(estimateCost('gemini-2.5-flash', 1_000, 100, null));
  });

  it("doesn't confuse flash-lite with flash", () => {
    const lite = estimateCost('gemini-2.5-flash-lite', 10_000, 1_000, null)!;
    const flash = estimateCost('gemini-2.5-flash', 10_000, 1_000, null)!;
    expect(lite).toBeLessThan(flash);
  });

  it('falls back to an input/output split when only the total is known', () => {
    // 1M total -> 750k in, 250k out on gemini-2.5-flash: $0.225 + $0.625 = $0.85 = ₹72.25.
    expect(estimateCost('gemini-2.5-flash', null, null, 1_000_000)).toBe(72_250_000);
  });

  it('keeps the blended rate for models without split prices', () => {
    expect(estimateCost('claude-haiku-4-5', null, null, 1_000)).toBe(80_000);
  });

  it("returns null when the call can't be priced", () => {
    expect(estimateCost(null, 100, 100, 200)).toBeNull();
    expect(estimateCost('some-new-model', 100, 100, 200)).toBeNull();
    expect(estimateCost('gemini-2.5-flash', null, null, null)).toBeNull();
  });
});
