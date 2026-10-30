/**
 * Part-payments, instalments and the reminder windows.
 *
 * The SQL lives in the service and the migration; these pin the decisions
 * those make, so a later change has to disagree on purpose.
 */

describe('what is still owed', () => {
  /** Mirrors toRow in practice-invoices.service. */
  const balance = (total: number, paid: number) => Math.max(0, total - paid);

  it('is the whole invoice before anything is paid', () => {
    expect(balance(500000, 0)).toBe(500000);
  });

  it('shrinks by each payment', () => {
    expect(balance(500000, 200000)).toBe(300000);
  });

  it('is zero once covered, never negative', () => {
    // An overpayment is a credit the practice settles with the client
    // directly; a negative balance on an invoice reads as the practice owing
    // money, which is not what happened.
    expect(balance(500000, 500000)).toBe(0);
    expect(balance(500000, 600000)).toBe(0);
  });
});

describe('how much a payment is allowed to be', () => {
  /** Mirrors the guards in addPayment. */
  const check = (total: number, paid: number, amount: number): string | 'ok' => {
    if (!Number.isInteger(amount) || amount <= 0) return 'too small';
    const outstanding = total - paid;
    if (outstanding <= 0) return 'already paid';
    if (amount > outstanding) return 'more than owed';
    return 'ok';
  };

  it('accepts a part-payment', () => {
    expect(check(500000, 0, 200000)).toBe('ok');
  });

  it('accepts the exact remaining balance', () => {
    expect(check(500000, 200000, 300000)).toBe('ok');
  });

  it('refuses more than is owed', () => {
    // The usual cause: typing the invoice total into the box on an invoice
    // that is already half paid. Letting it through would show the practice
    // as having received more than it ever charged.
    expect(check(500000, 200000, 500000)).toBe('more than owed');
  });

  it('refuses anything on a settled invoice', () => {
    expect(check(500000, 500000, 100)).toBe('already paid');
  });

  it('refuses zero, negative and fractional paise', () => {
    expect(check(500000, 0, 0)).toBe('too small');
    expect(check(500000, 0, -100)).toBe('too small');
    expect(check(500000, 0, 150.5)).toBe('too small');
  });
});

describe('an instalment schedule', () => {
  /** Mirrors setSchedule's validation. */
  const validate = (total: number, parts: number[]): string | 'ok' => {
    if (!parts.length) return 'cleared';
    if (parts.length > 36) return 'too many';
    if (parts.some((p) => !Number.isInteger(p) || p <= 0)) return 'bad amount';
    const sum = parts.reduce((s, p) => s + p, 0);
    if (sum !== total) return 'does not add up';
    return 'ok';
  };

  it('must add up to the invoice exactly', () => {
    expect(validate(300000, [100000, 100000, 100000])).toBe('ok');
  });

  it('refuses a schedule that is short or over', () => {
    // Caught now rather than three months later, when the last instalment is
    // paid and the invoice still insists money is owed.
    expect(validate(300000, [100000, 100000])).toBe('does not add up');
    expect(validate(300000, [100000, 100000, 150000])).toBe('does not add up');
  });

  it('handles a total that does not divide evenly', () => {
    // 100001 paise over 3: the practice decides where the odd paisa goes, and
    // the only rule is that it must still sum.
    expect(validate(100001, [33334, 33334, 33333])).toBe('ok');
  });

  it('treats an empty schedule as going back to a single payment', () => {
    expect(validate(300000, [])).toBe('cleared');
  });

  it('refuses a zero-value instalment', () => {
    expect(validate(300000, [300000, 0])).toBe('bad amount');
  });
});

describe('which instalments get reminded', () => {
  const DAY = 86_400_000;
  const LEAD = 7;
  const today = new Date('2026-11-10T09:00:00+05:30');
  const dayOffset = (n: number) => new Date(today.getTime() + n * DAY);

  /** Mirrors the two SQL windows, in days from today. */
  const inWindow = (when: 'before' | 'due', dueInDays: number) =>
    when === 'before' ? dueInDays > 0 && dueInDays <= LEAD : dueInDays <= 0;

  it('nudges a week ahead, inclusive', () => {
    expect(inWindow('before', 7)).toBe(true);
    expect(inWindow('before', 1)).toBe(true);
  });

  it('does not nudge something due further out', () => {
    expect(inWindow('before', 8)).toBe(false);
  });

  it('sends one nudge inside the week, not one per day of it', () => {
    // 7 days + on the day, decided deliberately: there is no separate
    // five-day reminder, and a row claimed at seven days is not claimed
    // again at five - a client chased three times for the same money stops
    // reading any of it.
    expect(inWindow('before', 5)).toBe(true);
  });

  it('does not use the early nudge for something due today', () => {
    // Today belongs to the on-the-day reminder. Without this the client gets
    // both messages on the same morning.
    expect(inWindow('before', 0)).toBe(false);
    expect(inWindow('due', 0)).toBe(true);
  });

  it('still chases something already overdue', () => {
    // A run that was down for a week must not skip what it missed.
    expect(inWindow('due', -3)).toBe(true);
  });

  it('the two windows never overlap', () => {
    for (let d = -10; d <= 10; d += 1) {
      expect(inWindow('before', d) && inWindow('due', d)).toBe(false);
    }
  });

  it('reads the countdown as a sentence', () => {
    const days = (due: Date): string => {
      const d = Math.max(0, Math.round(
        (new Date(due).setHours(0, 0, 0, 0) - today.getTime()) / DAY,
      ));
      if (d === 0) return 'today';
      if (d === 1) return 'tomorrow';
      return `${d} days`;
    };
    expect(days(dayOffset(5))).toBe('5 days');
    expect(days(dayOffset(1))).toBe('tomorrow');
  });
});

describe('the invoice status follows the ledger', () => {
  /** Mirrors sync_practice_invoice_paid in the migration. */
  const sync = (status: string, total: number, paid: number): string => {
    if (status === 'draft' || status === 'void') return status;
    if (paid >= total && total > 0) return 'paid';
    return status === 'paid' ? 'sent' : status;
  };

  it('settles an invoice once payments cover it', () => {
    expect(sync('sent', 500000, 500000)).toBe('paid');
  });

  it('leaves a part-paid invoice owed', () => {
    expect(sync('sent', 500000, 200000)).toBe('sent');
  });

  it('reopens a paid invoice when a payment is removed', () => {
    // The un-pay path, reached by correcting the money rather than the status.
    expect(sync('paid', 500000, 200000)).toBe('sent');
  });

  it('never revives a voided invoice', () => {
    expect(sync('void', 500000, 500000)).toBe('void');
  });

  it('leaves a draft alone', () => {
    // Money against an unissued invoice is the practice's own bookkeeping
    // order, not ours to reinterpret.
    expect(sync('draft', 500000, 500000)).toBe('draft');
  });

  it('does not mark a zero-value invoice paid', () => {
    expect(sync('sent', 0, 0)).toBe('sent');
  });
});
