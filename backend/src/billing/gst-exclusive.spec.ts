import { computeGstExclusive, computeGstInclusive } from './billing-tax';

/**
 * Plan prices are quoted exclusive of GST: a practice sees Rs 3,999 and is
 * charged Rs 4,719. Setup fees and credit packs stay inclusive.
 *
 * These are the real catalogue numbers, so a wrong rounding rule shows up here
 * as a figure that does not match the pricing page rather than as an abstract
 * off-by-one.
 */

const RS = (paise: number) => paise / 100;

describe('GST added on top of a plan price', () => {
  it.each([
    ['Starter', 3999, 719.82, 4718.82],
    ['Growth', 8999, 1619.82, 10618.82],
    ['Scale Pro', 19999, 3599.82, 23598.82],
  ])('%s: Rs %d + 18%% = Rs %s GST, Rs %s total', (_name, priceInr, gstRs, grossRs) => {
    const g = computeGstExclusive(priceInr * 100);
    expect(RS(g.basePaise)).toBe(priceInr);
    expect(RS(g.gstPaise)).toBeCloseTo(gstRs as number, 2);
    expect(RS(g.grossPaise)).toBeCloseTo(grossRs as number, 2);
  });

  it('keeps the full quoted price as NUSI revenue', () => {
    // The point of the change: inclusive pricing took the tax out of margin.
    const inclusive = computeGstInclusive(3999 * 100);
    const exclusive = computeGstExclusive(3999 * 100);

    expect(RS(inclusive.basePaise)).toBeCloseTo(3389.0, 0); // what we used to keep
    expect(RS(exclusive.basePaise)).toBe(3999); // what we keep now
  });

  it('always has base + gst exactly equal to gross', () => {
    // Any rounding rule that breaks this produces an invoice that does not add
    // up, which is a compliance problem, not a cosmetic one.
    for (const paise of [1, 99, 100, 399900, 899900, 1999900, 4999900, 7]) {
      const g = computeGstExclusive(paise);
      expect(g.basePaise + g.gstPaise).toBe(g.grossPaise);
    }
  });

  it('splits intra-state GST so the halves sum to the whole', () => {
    const g = computeGstExclusive(3999 * 100);
    expect(g.cgstPaise + g.sgstPaise).toBe(g.gstPaise);
    expect(g.igstPaise).toBe(0);
    expect(g.interState).toBe(false);
  });

  it('uses a single IGST line inter-state', () => {
    const g = computeGstExclusive(3999 * 100, { interState: true });
    expect(g.igstPaise).toBe(g.gstPaise);
    expect(g.cgstPaise).toBe(0);
    expect(g.sgstPaise).toBe(0);
  });

  it('gives an odd paise to SGST rather than losing it', () => {
    // 7 paise of GST must not round to 3 + 3.
    const g = computeGstExclusive(39);
    expect(g.cgstPaise + g.sgstPaise).toBe(g.gstPaise);
  });

  it('handles zero without inventing tax', () => {
    const g = computeGstExclusive(0);
    expect(g.grossPaise).toBe(0);
    expect(g.gstPaise).toBe(0);
  });

  it('honours a non-default rate', () => {
    const g = computeGstExclusive(100000, { ratePercent: 5 });
    expect(g.gstPaise).toBe(5000);
    expect(g.grossPaise).toBe(105000);
  });
});
