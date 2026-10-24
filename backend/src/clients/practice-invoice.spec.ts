import {
  normaliseLine,
  normaliseLines,
  computeTotals,
  invoiceNumber,
  MAX_LINES,
} from './practice-invoice';

/**
 * Money a nutritionist charges their own client. A rounding slip here is a
 * wrong number on a document a real person is asked to pay, so the sums are
 * checked against the kind of figures an Indian practice actually bills.
 */

const rs = (paise: number) => paise / 100;

describe('line validation', () => {
  it('keeps a well-formed line', () => {
    expect(normaliseLine({ description: 'Consultation', quantity: 2, unit_paise: 150000 }))
      .toEqual({ description: 'Consultation', quantity: 2, unit_paise: 150000 });
  });

  it('defaults a missing quantity to one', () => {
    expect(normaliseLine({ description: 'Diet plan', unit_paise: 200000 }).quantity).toBe(1);
  });

  it('trims the description and refuses an empty one', () => {
    expect(normaliseLine({ description: '  Follow-up  ', unit_paise: 100 }).description)
      .toBe('Follow-up');
    expect(() => normaliseLine({ description: '   ', unit_paise: 100 })).toThrow(/description/);
  });

  it('refuses a negative price rather than quietly crediting the client', () => {
    expect(() => normaliseLine({ description: 'x', unit_paise: -500 })).toThrow(/out of range/);
  });

  it('refuses a fractional quantity', () => {
    // 2.5 consultations is a price change, not a quantity.
    expect(() => normaliseLine({ description: 'x', quantity: 0.5, unit_paise: 100 }))
      .toThrow(/whole number/);
  });

  it('refuses nonsense quantities', () => {
    for (const q of [0, -1, 1000, NaN]) {
      expect(() => normaliseLine({ description: 'x', quantity: q, unit_paise: 100 }))
        .toThrow(/whole number/);
    }
  });

  it('rounds a float price to whole paise instead of storing it', () => {
    // A float that reaches the DB is how a total stops matching its lines.
    expect(normaliseLine({ description: 'x', unit_paise: 150000.4 }).unit_paise).toBe(150000);
  });
});

describe('the line set', () => {
  it('needs at least one line', () => {
    expect(() => normaliseLines([])).toThrow(/at least one/);
    expect(() => normaliseLines(null)).toThrow(/at least one/);
  });

  it('caps how many lines one invoice can carry', () => {
    const many = Array.from({ length: MAX_LINES + 1 }, () => ({ description: 'x', unit_paise: 1 }));
    expect(() => normaliseLines(many)).toThrow(/at most/);
  });
});

describe('totals', () => {
  it('adds up a real consultation invoice', () => {
    const lines = normaliseLines([
      { description: 'Consultation', quantity: 2, unit_paise: 150000 }, // Rs 1,500 x 2
      { description: 'Diet plan - 4 weeks', quantity: 1, unit_paise: 200000 }, // Rs 2,000
    ]);
    const t = computeTotals(lines);
    expect(rs(t.subtotal_paise)).toBe(5000);
    expect(t.tax_paise).toBe(0); // most practices are not GST-registered
    expect(rs(t.total_paise)).toBe(5000);
  });

  it('adds the practice GST when they are registered', () => {
    const lines = normaliseLines([{ description: 'Programme', unit_paise: 1000000 }]); // Rs 10,000
    const t = computeTotals(lines, 18);
    expect(rs(t.subtotal_paise)).toBe(10000);
    expect(rs(t.tax_paise)).toBe(1800);
    expect(rs(t.total_paise)).toBe(11800);
  });

  it('always has subtotal + tax exactly equal to the total', () => {
    // An invoice that does not add up is the one thing a client will notice.
    for (const [paise, rate] of [[1, 18], [99, 5], [333333, 18], [1, 0.5], [7, 12]] as const) {
      const t = computeTotals([{ description: 'x', quantity: 1, unit_paise: paise }], rate);
      expect(t.subtotal_paise + t.tax_paise).toBe(t.total_paise);
    }
  });

  it('taxes the subtotal once, not each line', () => {
    // Per-line rounding would drift from subtotal x rate - the discrepancy a
    // client queries. Three lines of Rs 3.33 at 18%: 999 paise -> 180, not 3x60.
    const lines = Array.from({ length: 3 }, () => ({
      description: 'x', quantity: 1, unit_paise: 333,
    }));
    const t = computeTotals(lines, 18);
    expect(t.subtotal_paise).toBe(999);
    expect(t.tax_paise).toBe(Math.round((999 * 18) / 100));
  });

  it('treats a missing or silly rate as no tax', () => {
    const line = [{ description: 'x', quantity: 1, unit_paise: 100000 }];
    expect(computeTotals(line).tax_paise).toBe(0);
    expect(computeTotals(line, NaN).tax_paise).toBe(0);
    expect(computeTotals(line, -5).tax_paise).toBe(0);
  });

  it('clamps an impossible rate rather than inventing tax', () => {
    const t = computeTotals([{ description: 'x', quantity: 1, unit_paise: 100 }], 500);
    expect(t.tax_percent).toBe(100);
  });

  it('multiplies quantity by unit price, not the other way round', () => {
    const t = computeTotals([{ description: 'x', quantity: 3, unit_paise: 49900 }]);
    expect(rs(t.subtotal_paise)).toBe(1497);
  });
});

describe('invoice numbers', () => {
  it('pads so a practice list sorts and reads consistently', () => {
    expect(invoiceNumber(1)).toBe('INV-0001');
    expect(invoiceNumber(42)).toBe('INV-0042');
  });

  it('does not truncate once a practice passes 9,999 invoices', () => {
    expect(invoiceNumber(10000)).toBe('INV-10000');
  });
});
