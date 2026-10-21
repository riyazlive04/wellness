import { RazorpayWebhookService } from './razorpay-webhook.service';

type Mock = jest.Mock;

/**
 * Paying a trial-conversion payment link must actually unlock the practice.
 *
 * A payment link creates no subscription on Razorpay's books, but the
 * effective plan is read from our subscriptions table, so without a row here
 * the practice pays and stays locked out by TrialGuard. These tests pin the
 * parts that make that work: the notes the link carries, the row that gets
 * written, and the loud failure when it cannot be.
 */
describe('trial conversion by payment link', () => {
  const WS = '11111111-1111-4111-8111-111111111111';

  const make = (over: { insertThrows?: boolean } = {}) => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockImplementation((sql: string) =>
        over.insertThrows && sql.includes('INSERT INTO public.subscriptions')
          ? Promise.reject(new Error('db down'))
          : Promise.resolve([]),
      ),
    };
    const notifications = { emit: jest.fn().mockResolvedValue(true) };
    // (prisma, invoices, billing notifications, app notifications, config)
    const svc = new RazorpayWebhookService(
      prisma as never,
      {} as never,
      notifications as never,
      {} as never,
      { get: () => 'test-secret' } as never,
    );
    const errors: string[] = [];
    jest.spyOn((svc as never as { logger: { error: (m: string) => void } }).logger, 'error')
      .mockImplementation((m: string) => void errors.push(String(m)));
    jest.spyOn((svc as never as { logger: { log: (m: string) => void } }).logger, 'log')
      .mockImplementation(() => undefined);
    // The handler is private: this is the seam the webhook calls it through.
    const run = (notes: Record<string, string | undefined> | undefined, amount = 399900) =>
      (svc as never as {
        fulfilTrialConversion: (w: string, p: string, a: number, n?: Record<string, string | undefined>) => Promise<void>;
      }).fulfilTrialConversion(WS, 'pay_123', amount, notes);
    return { run, prisma, notifications, errors };
  };

  const sqlOf = (prisma: { $queryRawUnsafe: Mock }, needle: string) =>
    prisma.$queryRawUnsafe.mock.calls.find((c) => String(c[0]).includes(needle));

  it('does nothing for a payment that is not a conversion', async () => {
    const { run, prisma } = make();
    await run({ topup_key: 'ai_1000' });
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('does nothing when there are no notes at all', async () => {
    const { run, prisma } = make();
    await run(undefined);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('creates an active subscription so the practice is unlocked', async () => {
    const { run, prisma } = make();
    await run({ kind: 'trial_conversion', plan_key: 'starter' });

    const insert = sqlOf(prisma as never, 'INSERT INTO public.subscriptions');
    expect(insert).toBeDefined();
    expect(String(insert![0])).toContain("'active'");
    // One month of access, and keyed on the payment so a replayed webhook
    // cannot create a second subscription.
    expect(String(insert![0])).toContain("interval '1 month'");
    expect(String(insert![0])).toContain('ON CONFLICT (razorpay_subscription_id) DO NOTHING');
    expect(insert![2]).toBe('plink_pay_123');
    expect(insert![3]).toBe('starter');
  });

  it('takes the workspace off the trial plan', async () => {
    const { run, prisma } = make();
    await run({ kind: 'trial_conversion', plan_key: 'growth' });
    const update = sqlOf(prisma as never, 'UPDATE public.workspaces');
    expect(update).toBeDefined();
    expect(update![2]).toBe('growth');
  });

  it('records what was actually paid', async () => {
    const { run, prisma } = make();
    await run({ kind: 'trial_conversion', plan_key: 'starter' }, 123456);
    expect(sqlOf(prisma as never, 'INSERT INTO public.subscriptions')![4]).toBe(123456);
  });

  it('falls back to the plan price when the amount is missing', async () => {
    const { run, prisma } = make();
    await run({ kind: 'trial_conversion', plan_key: 'starter' }, 0);
    expect(sqlOf(prisma as never, 'INSERT INTO public.subscriptions')![4]).toBe(3999 * 100);
  });

  it('marks it manual_renewal, since a link sets up no auto-renewal', async () => {
    const { run, prisma } = make();
    await run({ kind: 'trial_conversion', plan_key: 'starter' });
    const meta = JSON.parse(String(sqlOf(prisma as never, 'INSERT INTO public.subscriptions')![5]));
    expect(meta).toMatchObject({ source: 'payment_link', manual_renewal: true, payment_id: 'pay_123' });
  });

  it('tells them it covers one month and to set up auto-renewal', async () => {
    const { run, notifications } = make();
    await run({ kind: 'trial_conversion', plan_key: 'starter' });
    const n = (notifications.emit as Mock).mock.calls[0][0];
    expect(n.body).toMatch(/one month/i);
    expect(n.body).toMatch(/auto-renewal/i);
    expect(n.dedupeKey).toBe('trial_conversion:pay_123');
  });

  it('shouts PAID BUT NOT UNLOCKED on an unknown plan rather than failing quietly', async () => {
    const { run, prisma, errors } = make();
    await run({ kind: 'trial_conversion', plan_key: 'nonsense' });
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(errors.join(' ')).toContain('PAID BUT NOT UNLOCKED');
  });

  it('shouts PAID BUT NOT UNLOCKED when the insert fails', async () => {
    const { run, errors } = make({ insertThrows: true });
    await run({ kind: 'trial_conversion', plan_key: 'starter' });
    expect(errors.join(' ')).toContain('PAID BUT NOT UNLOCKED');
  });

  it('never throws out of the webhook — the payment is already recorded', async () => {
    const { run } = make({ insertThrows: true });
    await expect(run({ kind: 'trial_conversion', plan_key: 'starter' })).resolves.toBeUndefined();
  });
});
