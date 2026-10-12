import { RazorpayWebhookService } from './razorpay-webhook.service';

/** Checkout switches the plan on itself, without waiting for the webhook. */

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function make() {
  const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
  const notifications = { emit: jest.fn().mockResolvedValue(true) };
  const config = { get: jest.fn().mockReturnValue('whsec') };
  const svc = new RazorpayWebhookService(prisma as never, {} as never, notifications as never, {} as never, config as never);
  return { svc, prisma, notifications };
}

const sub = (workspaceId: string, status = 'active') => ({
  id: 'sub_1', plan_id: 'plan_g', status, current_start: 1_790_000_000, current_end: 1_792_600_000,
  notes: { workspace_id: workspaceId, plan_key: 'growth' },
});

describe('syncSubscriptionFromCheckout', () => {
  it('records the paid subscription and tells the practice it is active', async () => {
    const { svc, prisma, notifications } = make();
    expect(await svc.syncSubscriptionFromCheckout(WS, sub(WS))).toBe(true);
    const [sql, ...args] = prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('INSERT INTO public.subscriptions');
    expect(args.slice(0, 6)).toEqual([WS, 'sub_1', 'plan_g', null, 'growth', 'active']);
    expect(notifications.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'subscription_activated', dedupeKey: 'subscription_activated:sub_1' }));
  });

  it("never activates another practice's subscription", async () => {
    const { svc, prisma } = make();
    expect(await svc.syncSubscriptionFromCheckout(WS, sub(OTHER))).toBe(false);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
