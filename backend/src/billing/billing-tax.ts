/**
 * GST tax model for NUSI invoices (Module 3 — Tax Architecture).
 *
 * Our published plan/top-up prices (plans.ts `priceInr`) are **tax-inclusive** —
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

/** Resolve the configured GST rate from env, falling back to the 18% default. */
export function resolveGstPercent(raw: string | number | undefined | null): number {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100) return n;
  return DEFAULT_GST_PERCENT;
}
