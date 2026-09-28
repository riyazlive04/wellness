import { recordSetupFeePaid, setupFeeDue, setupFeeStatus } from './setup-fee';

/**
 * A setup fee is paid once per plan level: upgrading pays only the gap.
 * It used to be a single "paid" stamp, so Starter -> Growth paid nothing.
 */

describe('setupFeeDue', () => {
  it('charges the full fee on a first subscription', () => {
    expect(setupFeeDue(4999, { paidInr: 0, legacyPaid: false })).toBe(4999);
  });

  it('charges only the difference when upgrading Starter -> Growth', () => {
    expect(setupFeeDue(9999, { paidInr: 4999, legacyPaid: false })).toBe(5000);
  });

  it('charges the rest when going on to Scale Pro', () => {
    expect(setupFeeDue(24999, { paidInr: 9999, legacyPaid: false })).toBe(15000);
  });

  it('charges nothing when the fee is already covered (re-subscribe, downgrade)', () => {
    expect(setupFeeDue(9999, { paidInr: 9999, legacyPaid: false })).toBe(0);
    expect(setupFeeDue(4999, { paidInr: 9999, legacyPaid: false })).toBe(0);
  });

  it('never charges again for a fee paid before amounts were recorded', () => {
    expect(setupFeeDue(24999, { paidInr: 0, legacyPaid: true })).toBe(0);
  });
});

describe('setupFeeStatus', () => {
  const prisma = (row: unknown) => ({ $queryRawUnsafe: async () => (row ? [row] : []) }) as never;

  it('treats an old paid stamp with no recorded amount as legacy-paid', async () => {
    expect(await setupFeeStatus(prisma({ paid_inr: 0, stamped: true }), 'ws')).toEqual({ paidInr: 0, legacyPaid: true });
  });

  it('uses the recorded amount once there is one', async () => {
    expect(await setupFeeStatus(prisma({ paid_inr: 4999, stamped: true }), 'ws')).toEqual({ paidInr: 4999, legacyPaid: false });
  });
});

describe('recordSetupFeePaid', () => {
  it('records once per subscription and skips zero amounts', async () => {
    const sql: string[] = [];
    const prisma = { $executeRawUnsafe: async (q: string) => (sql.push(q), 1) } as never;
    await recordSetupFeePaid(prisma, 'ws', 'sub_1', 'starter', 0);
    expect(sql).toHaveLength(0);
    await recordSetupFeePaid(prisma, 'ws', 'sub_1', 'starter', 4999);
    expect(sql[0]).toContain('ON CONFLICT (razorpay_subscription_id) DO NOTHING');
  });
});
