/**
 * Totals for an invoice a practice issues to its own client.
 *
 * Kept separate from the service so the money maths is testable without a
 * database. Everything is integer paise: a float rupee total is how an invoice
 * ends up a paisa short of the sum of its own lines.
 *
 * Tax here is the PRACTICE's GST, not NUSI's. Most nutritionists are under the
 * registration threshold, so the default is 0% and the invoice simply shows no
 * tax line. A registered practice sets its own rate.
 */

export interface InvoiceLine {
  description: string;
  /** Whole units. A half-consultation is a price change, not a quantity. */
  quantity: number;
  /** Price for ONE unit, in paise. */
  unit_paise: number;
}

export interface InvoiceTotals {
  subtotal_paise: number;
  tax_percent: number;
  tax_paise: number;
  total_paise: number;
}

/** One line can be large (a year's programme) but not absurd: Rs 10,00,000. */
const MAX_UNIT_PAISE = 100_000_000;
const MAX_QUANTITY = 999;
export const MAX_LINES = 50;

/**
 * Clean one line as it arrives from a browser.
 *
 * Throws rather than silently correcting: a practice that typed a price wrong
 * should see an error, not an invoice quietly worth something else.
 */
export function normaliseLine(raw: unknown): InvoiceLine {
  const o = (raw ?? {}) as Record<string, unknown>;

  const description = String(o.description ?? '').trim();
  if (!description) throw new Error('Every line needs a description.');
  if (description.length > 200) throw new Error('A line description is too long (200 characters max).');

  const quantity = Math.floor(Number(o.quantity ?? 1));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new Error(`Quantity must be a whole number between 1 and ${MAX_QUANTITY}.`);
  }

  // Accept only an integer paise amount. A float here would round somewhere
  // unpredictable and the invoice would not add up.
  const unit_paise = Math.round(Number(o.unit_paise ?? 0));
  if (!Number.isFinite(unit_paise) || unit_paise < 0 || unit_paise > MAX_UNIT_PAISE) {
    throw new Error('A line amount is out of range.');
  }

  return { description, quantity, unit_paise };
}

/** Clean a whole set of lines. An invoice needs at least one. */
export function normaliseLines(raw: unknown): InvoiceLine[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('An invoice needs at least one line.');
  }
  if (raw.length > MAX_LINES) {
    throw new Error(`An invoice can have at most ${MAX_LINES} lines.`);
  }
  return raw.map(normaliseLine);
}

/**
 * Add it up.
 *
 * Tax is applied to the subtotal once, not per line: rounding each line's tax
 * and summing those gives a total that disagrees with `subtotal x rate`, which
 * is exactly the kind of discrepancy a client queries.
 */
export function computeTotals(lines: InvoiceLine[], taxPercent = 0): InvoiceTotals {
  const subtotal_paise = lines.reduce((sum, l) => sum + l.quantity * l.unit_paise, 0);

  const rate = Number.isFinite(taxPercent) ? Math.max(0, Math.min(100, taxPercent)) : 0;
  const tax_paise = rate > 0 ? Math.round((subtotal_paise * rate) / 100) : 0;

  return {
    subtotal_paise,
    tax_percent: rate,
    tax_paise,
    total_paise: subtotal_paise + tax_paise,
  };
}

/** "INV-0007" - padded so a practice's invoices sort and read consistently. */
export function invoiceNumber(n: number): string {
  return `INV-${String(n).padStart(4, '0')}`;
}
