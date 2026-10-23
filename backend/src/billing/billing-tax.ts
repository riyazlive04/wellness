/**
 * GST tax model for NUSI invoices (Module 3 — Tax Architecture).
 *
 * The inclusive model:
 * what the customer is charged at Razorpay Checkout is the final number. For a
 * GST-compliant invoice we therefore *back-compute* the taxable base and the GST
 * component out of the gross amount rather than adding tax on top.
 *
 *   gross = base + gst        (gross is what was actually charged)
 *   base  = round(gross / (1 + rate))
 *   gst   = gross - base
 *
 * Place-of-supply rule (India):
 *   - intra-state (customer in the same state as us) → CGST + SGST, split 50/50
 *   - inter-state                                    → single IGST
 * We don't reliably capture customer state at checkout, so the default is the
 * supplier state (intra-state, CGST+SGST). The split is presentational only —
 * the total GST is identical either way.
 *
 * Everything is in paise (1 INR = 100 paise) to stay integer-safe; no floats
 * leak into stored amounts.
 */

/** Default combined GST rate for SaaS in India (18%). Override via BILLING_GST_PERCENT. */
export const DEFAULT_GST_PERCENT = 18;

export interface GstBreakdown {
  /** Total charged, tax-inclusive (paise). */
  grossPaise: number;
  /** Taxable value before GST (paise). */
  basePaise: number;
  /** Total GST component (paise). */
  gstPaise: number;
  /** CGST half (paise) — 0 for inter-state. */
  cgstPaise: number;
  /** SGST half (paise) — 0 for inter-state. */
  sgstPaise: number;
  /** IGST (paise) — 0 for intra-state. */
  igstPaise: number;
  /** Rate applied, as a percent (e.g. 18). */
  ratePercent: number;
  /** Whether the supply was treated as inter-state (IGST) or intra-state (CGST+SGST). */
  interState: boolean;
}

/**
 * Split a tax-inclusive gross amount (paise) into base + GST.
 *
 * @param grossPaise  the amount actually charged, inclusive of GST
 * @param opts.ratePercent  combined GST rate (default 18)
 * @param opts.interState   true → single IGST line; false → CGST+SGST (default)
 */
export function computeGstInclusive(
  grossPaise: number,
  opts: { ratePercent?: number; interState?: boolean } = {},
): GstBreakdown {
  const ratePercent = opts.ratePercent ?? DEFAULT_GST_PERCENT;
  const interState = opts.interState ?? false;
  const gross = Math.max(0, Math.round(grossPaise));

  // base = gross / (1 + rate); GST is the remainder so the two always sum to gross.
  const basePaise = Math.round(gross / (1 + ratePercent / 100));
  const gstPaise = gross - basePaise;

  if (interState) {
    return {
      grossPaise: gross,
      basePaise,
      gstPaise,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: gstPaise,
      ratePercent,
      interState: true,
    };
  }

  // Intra-state: split GST evenly, giving any odd paise to SGST so the parts sum exactly.
  const cgstPaise = Math.floor(gstPaise / 2);
  const sgstPaise = gstPaise - cgstPaise;
  return {
    grossPaise: gross,
    basePaise,
    gstPaise,
    cgstPaise,
    sgstPaise,
    igstPaise: 0,
    ratePercent,
    interState: false,
  };
}

/**
 * Add GST ON TOP of a tax-exclusive price.
 *
 * Plan prices are quoted exclusive of GST - a practice buying Starter sees
 * Rs 3,999 and is charged Rs 4,719. Their GST is reclaimable as input credit,
 * so the exclusive quote is what B2B buyers expect, and NUSI keeps the full
 * Rs 3,999 rather than absorbing the tax out of margin.
 *
 * Setup fees and credit packs stay INCLUSIVE and keep using
 * computeGstInclusive - mixing the two in one charge is handled by the caller,
 * which adds GST only to the plan portion.
 *
 * @param basePaise the quoted price, exclusive of GST
 */
export function computeGstExclusive(
  basePaise: number,
  opts: { ratePercent?: number; interState?: boolean } = {},
): GstBreakdown {
  const ratePercent = opts.ratePercent ?? DEFAULT_GST_PERCENT;
  const interState = opts.interState ?? false;
  const base = Math.max(0, Math.round(basePaise));

  // GST is rounded once, and gross is base + that, so the three always agree.
  const gstPaise = Math.round((base * ratePercent) / 100);
  const grossPaise = base + gstPaise;

  if (interState) {
    return {
      grossPaise, basePaise: base, gstPaise,
      cgstPaise: 0, sgstPaise: 0, igstPaise: gstPaise,
      ratePercent, interState: true,
    };
  }

  const cgstPaise = Math.floor(gstPaise / 2);
  const sgstPaise = gstPaise - cgstPaise;
  return {
    grossPaise, basePaise: base, gstPaise,
    cgstPaise, sgstPaise, igstPaise: 0,
    ratePercent, interState: false,
  };
}

/**
 * What a plan actually costs to buy, in paise, GST included.
 *
 * One helper so the "plans are quoted exclusive" rule lives in a single place:
 * the checkout, the pay-once path, the reminder's payment link and the webhook
 * fallback must all arrive at the same number, or a practice is quoted one
 * amount and charged another.
 *
 * Setup fees are NOT passed through here - they stay tax-inclusive, so a first
 * payment is planWithGst + setupFee.
 */
export function planChargePaise(
  priceInr: number,
  opts: { ratePercent?: number } = {},
): number {
  return computeGstExclusive(priceInr * 100, opts).grossPaise;
}

/** Resolve the configured GST rate from env, falling back to the 18% default. */
export function resolveGstPercent(raw: string | number | undefined | null): number {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100) return n;
  return DEFAULT_GST_PERCENT;
}
