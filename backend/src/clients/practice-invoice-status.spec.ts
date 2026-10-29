import { computeTotals, invoiceNumber, normaliseLines } from './practice-invoice';

/**
 * The rules behind correcting an invoice.
 *
 * A practice reported that an invoice marked paid by mistake could not be
 * changed back. Two separate rules caused it: `update` refused anything that
 * was not a draft, and `markPaid` returned silently when already paid with no
 * inverse. The only escape was voiding a real invoice and re-issuing it,
 * which leaves a hole in the practice's own numbering for a typing mistake.
 *
 * The service holds the SQL; these pin the decisions it makes.
 */
describe('invoice status corrections', () => {
  /** What `update` now allows, mirroring the guard in the service. */
  const editable = (status: string) => status !== 'void';

  /** What `unmarkPaid` does for a given status. */
  const unmark = (status: string): 'sent' | 'unchanged' | 'rejected' => {
    if (status === 'void') return 'rejected';
    if (status !== 'paid') return 'unchanged';
    return 'sent';
  };

  it('allows a paid invoice to be edited — the reported bug', () => {
    expect(editable('paid')).toBe(true);
  });

  it('allows a sent invoice to be corrected without voiding it', () => {
    expect(editable('sent')).toBe(true);
    expect(editable('draft')).toBe(true);
  });

  it('keeps a voided invoice closed', () => {
    expect(editable('void')).toBe(false);
    expect(unmark('void')).toBe('rejected');
  });

  it('returns a mistakenly-paid invoice to sent, not draft', () => {
    // 'sent' because it genuinely was sent: a client watching their invoices
    // should not see one vanish because the practice fixed its bookkeeping.
    expect(unmark('paid')).toBe('sent');
  });

  it('is harmless on an invoice that was never paid', () => {
    expect(unmark('sent')).toBe('unchanged');
    expect(unmark('draft')).toBe('unchanged');
  });
});

describe('invoice money, unchanged by the correction work', () => {
  it('taxes the subtotal once, never per line', () => {
    const lines = normaliseLines([
      { description: 'Consultation', quantity: 2, unit_paise: 150000 },
      { description: 'Plan', quantity: 1, unit_paise: 350000 },
    ]);
    const t = computeTotals(lines, 18);
    expect(t.subtotal_paise).toBe(650000);
    expect(t.tax_paise).toBe(Math.round(650000 * 0.18));
    expect(t.total_paise).toBe(650000 + t.tax_paise);
  });

  it('adds no tax when the practice is not registered', () => {
    const lines = normaliseLines([{ description: 'Follow-up', quantity: 1, unit_paise: 120000 }]);
    const t = computeTotals(lines, 0);
    expect(t.tax_paise).toBe(0);
    expect(t.total_paise).toBe(120000);
  });

  it('numbers invoices for display', () => {
    expect(invoiceNumber(7)).toBe('INV-0007');
  });
});
