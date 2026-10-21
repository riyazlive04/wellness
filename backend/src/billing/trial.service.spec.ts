import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { DEFAULT_TRIAL_DAYS, TRIAL_WARN_DAYS, TrialService, type TrialRow } from './trial.service';

type Mock = jest.Mock;

const makeService = (over: {
  platformConfig?: unknown;
  queryRows?: unknown[][];
  configured?: boolean;
  linkUrl?: string | null;
  linkThrows?: boolean;
} = {}) => {
  const queue = [...(over.queryRows ?? [])];
  const prisma = {
    platform_config: {
      findUnique: jest.fn().mockImplementation(() =>
        over.platformConfig instanceof Error
          ? Promise.reject(over.platformConfig)
          : Promise.resolve(over.platformConfig ?? null),
      ),
    },
    $queryRawUnsafe: jest.fn().mockImplementation(() => Promise.resolve(queue.shift() ?? [])),
  };
  const mail = { send: jest.fn().mockResolvedValue(true) };
  const whatsapp = { sendPlatformText: jest.fn().mockResolvedValue(true) };
  const razorpay = {
    isConfigured: jest.fn().mockReturnValue(over.configured ?? true),
    createPaymentLink: jest.fn().mockImplementation(() =>
      over.linkThrows
        ? Promise.reject(new Error('razorpay down'))
        : Promise.resolve({ id: 'plink_1', short_url: over.linkUrl ?? 'https://rzp.io/i/abc' }),
    ),
  };
  const config = { get: jest.fn().mockReturnValue('https://nusi.in') } as unknown as ConfigService;

  const svc = new TrialService(prisma as never, config, mail as never, whatsapp as never, razorpay as never);
  return { svc, prisma, mail, whatsapp, razorpay };
};

const row = (over: Partial<TrialRow> = {}): TrialRow => ({
  workspace_id: '11111111-1111-4111-8111-111111111111',
  name: 'Aboothahir Nutrition',
  trial_ends_at: new Date('2026-10-24T18:29:00.000Z'),
  days_left: 3,
  owner_email: 'owner@example.com',
  owner_phone: '+919000000000',
  ...over,
});

describe('TrialService', () => {
  // A regression guard for the crash that took nusi.in down: a decorator
  // referencing a class declared below it typechecks but dies on import.
  it('module loads without a temporal dead zone error', async () => {
    await expect(import('./admin-trial.controller')).resolves.toBeDefined();
  });

  describe('trialDays', () => {
    it('reads the super admin setting', async () => {
      const { svc } = makeService({ platformConfig: { id: 1, trial_days: 21 } });
      await expect(svc.trialDays()).resolves.toBe(21);
    });

    it('allows zero days (trial switched off)', async () => {
      const { svc } = makeService({ platformConfig: { id: 1, trial_days: 0 } });
      await expect(svc.trialDays()).resolves.toBe(0);
    });

    it.each([null, undefined, -1, 400, 'abc'])('falls back when the value is %p', async (v) => {
      const { svc } = makeService({ platformConfig: { id: 1, trial_days: v } });
      await expect(svc.trialDays()).resolves.toBe(DEFAULT_TRIAL_DAYS);
    });

    it('falls back when there is no config row', async () => {
      const { svc } = makeService({ platformConfig: null });
      await expect(svc.trialDays()).resolves.toBe(DEFAULT_TRIAL_DAYS);
    });

    it('falls back rather than throwing when the read fails', async () => {
      const { svc } = makeService({ platformConfig: new Error('no db') });
      await expect(svc.trialDays()).resolves.toBe(DEFAULT_TRIAL_DAYS);
    });
  });

  describe('endingIn', () => {
    it('excludes exempt practices and ones that already subscribed', async () => {
      const { svc, prisma } = makeService({ queryRows: [[row()]] });
      await svc.endingIn(3);
      const sql = (prisma.$queryRawUnsafe as Mock).mock.calls[0][0] as string;
      expect(sql).toContain('NOT w.billing_exempt');
      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain('subscriptions');
      // An abandoned checkout must not silence the warnings for ever: a real
      // test practice had five 'created' rows from closed Razorpay pages and
      // was skipped every run.
      expect(sql).toContain("s.status = 'created'");
      expect(sql).toContain("($2 || ' hours')::interval");
      // Day-granular and in IST: comparing UTC dates would put a practice in
      // the wrong warning bucket for the 5.5 hours either side of midnight.
      expect(sql).toContain("AT TIME ZONE 'Asia/Kolkata'");
      expect(sql).not.toContain('now()::date');
      expect((prisma.$queryRawUnsafe as Mock).mock.calls[0][1]).toBe(3);
    });
  });

  describe('paymentLink', () => {
    it('creates a link tagged with the workspace so the webhook can match it', async () => {
      const { svc, razorpay } = makeService();
      await expect(svc.paymentLink(row().workspace_id, 'starter', {})).resolves.toBe('https://rzp.io/i/abc');
      const arg = (razorpay.createPaymentLink as Mock).mock.calls[0][0];
      expect(arg.amountPaise).toBe(3999 * 100);
      expect(arg.notes).toMatchObject({ workspace_id: row().workspace_id, plan_key: 'starter' });
      expect(arg.referenceId.length).toBeLessThanOrEqual(40);
    });

    it('rejects an unknown plan', async () => {
      const { svc } = makeService();
      await expect(svc.paymentLink(row().workspace_id, 'nope', {})).rejects.toThrow(BadRequestException);
    });

    it('returns null when Razorpay is not configured', async () => {
      const { svc, razorpay } = makeService({ configured: false });
      await expect(svc.paymentLink(row().workspace_id, 'starter', {})).resolves.toBeNull();
      expect(razorpay.createPaymentLink).not.toHaveBeenCalled();
    });

    it('returns null instead of throwing when Razorpay errors', async () => {
      const { svc } = makeService({ linkThrows: true });
      await expect(svc.paymentLink(row().workspace_id, 'starter', {})).resolves.toBeNull();
    });
  });

  describe('warn', () => {
    it('sends email and WhatsApp carrying a pay link', async () => {
      const { svc, mail, whatsapp } = makeService();
      await expect(svc.warn(row(), 'ending')).resolves.toEqual({ email: true, whatsapp: true });
      const sent = (mail.send as Mock).mock.calls[0][0];
      expect(sent.to).toBe('owner@example.com');
      expect(sent.subject).toContain('ends in 3 days');
      expect(sent.html).toContain('https://rzp.io/i/abc');
      expect((whatsapp.sendPlatformText as Mock).mock.calls[0][0].text).toContain('https://rzp.io/i/abc');
    });

    // The webhook keys fulfilment on these notes. If they drift, the practice
    // pays and nothing unlocks.
    it('tags the link so the webhook can unlock the practice', async () => {
      const { svc, razorpay } = makeService();
      await svc.warn(row(), 'ending');
      const arg = (razorpay.createPaymentLink as Mock).mock.calls[0][0];
      expect(arg.notes).toMatchObject({
        workspace_id: row().workspace_id,
        plan_key: 'starter',
        kind: 'trial_conversion',
      });
    });

    it.each([
      [0, 'ends today'],
      [1, 'ends tomorrow'],
      [7, 'ends in 7 days'],
    ])('phrases %i days left as "%s"', async (days, phrase) => {
      const { svc, mail } = makeService();
      await svc.warn(row({ days_left: days }), 'ending');
      expect((mail.send as Mock).mock.calls[0][0].subject).toContain(phrase);
    });

    it('tells a lapsed practice its data is safe', async () => {
      const { svc, mail, whatsapp } = makeService();
      await svc.warn(row({ days_left: 0 }), 'ended');
      expect((mail.send as Mock).mock.calls[0][0].subject).toContain('has ended');
      expect((whatsapp.sendPlatformText as Mock).mock.calls[0][0].text).toContain('Your data is safe');
    });

    it.each([
      ['Razorpay is unconfigured', { configured: false }],
      ['the link call fails', { linkThrows: true }],
    ])('falls back to the billing page when %s', async (_label, over) => {
      const { svc, mail } = makeService(over);
      await expect(svc.warn(row(), 'ending')).resolves.toEqual({ email: true, whatsapp: true });
      expect((mail.send as Mock).mock.calls[0][0].html).toContain('https://nusi.in/billing');
    });

    it('skips a channel with no address rather than failing the other', async () => {
      const { svc, mail, whatsapp } = makeService();
      await expect(svc.warn(row({ owner_email: null }), 'ending')).resolves.toEqual({ email: false, whatsapp: true });
      expect(mail.send).not.toHaveBeenCalled();

      const b = makeService();
      await expect(b.svc.warn(row({ owner_phone: null }), 'ending')).resolves.toEqual({ email: true, whatsapp: false });
      expect(b.whatsapp.sendPlatformText).not.toHaveBeenCalled();
      expect(whatsapp.sendPlatformText).toHaveBeenCalled();
    });

    it('still reports email sent when WhatsApp throws', async () => {
      const { svc, whatsapp } = makeService();
      (whatsapp.sendPlatformText as Mock).mockRejectedValue(new Error('gateway down'));
      await expect(svc.warn(row(), 'ending')).resolves.toEqual({ email: true, whatsapp: false });
    });

    it('escapes a practice name so it cannot inject markup into the email', async () => {
      const { svc, mail } = makeService();
      await svc.warn(row({ name: '<script>x</script>' }), 'ending');
      const html = (mail.send as Mock).mock.calls[0][0].html as string;
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('extend', () => {
    const found = [{ id: row().workspace_id, trial_ends_at: new Date('2026-10-24T00:00:00Z') }];
    const updated = [{ ends: '2026-10-31', left: 10 }];

    it('adds days from today so a lapsed trial still gets the full window', async () => {
      const { svc, prisma } = makeService({ queryRows: [found, updated] });
      await expect(svc.extend(row().workspace_id, { days: 7 }, 'admin-1')).resolves.toEqual({
        trial_ends_at: '2026-10-31',
        days_left: 10,
      });
      const [sql, , param] = (prisma.$queryRawUnsafe as Mock).mock.calls[1];
      expect(sql).toContain('GREATEST');
      expect(param).toBe('7');
    });

    it('sets an explicit end date when given one', async () => {
      const { svc, prisma } = makeService({ queryRows: [found, updated] });
      await svc.extend(row().workspace_id, { until: '2026-12-01' }, 'admin-1');
      const [sql, , param] = (prisma.$queryRawUnsafe as Mock).mock.calls[1];
      expect(sql).toContain('$2::date');
      expect(sql).not.toContain('GREATEST');
      expect(param).toBe('2026-12-01');
    });

    // A trial that expires at 06:04 because that is when they signed up looks
    // like a bug to whoever is locked out that morning.
    it('ends at 23:59 IST whichever way the date is given', async () => {
      // 23:59 alone is 23:59 UTC, which is 05:29 the next morning in India —
      // a trial that looks like it ends on the 24th expiring on the 25th.
      for (const opts of [{ days: 7 }, { until: '2026-12-01' }]) {
        const m = makeService({ queryRows: [found, updated] });
        await m.svc.extend(row().workspace_id, opts, 'admin-1');
        const sql = (m.prisma.$queryRawUnsafe as Mock).mock.calls[1][0] as string;
        expect(sql).toContain("time '23:59'");
        expect(sql).toContain("AT TIME ZONE 'Asia/Kolkata'");
      }
    });

    // Taking time back is as legitimate as giving it — undoing a mistaken
    // extension, or ending a trial early by agreement.
    it('shortens the trial when given negative days', async () => {
      const { svc, prisma } = makeService({ queryRows: [found, [{ ends: '2026-10-31', left: 10 }]] });
      await svc.extend(row().workspace_id, { days: -7 }, 'admin-1');
      const [sql, , param] = (prisma.$queryRawUnsafe as Mock).mock.calls[1];
      expect(param).toBe('-7');
      // A reduction must count from the current end date: clamping to now()
      // the way an extension does would refuse to go below today.
      expect(sql).toContain('WHEN $2::int < 0 THEN COALESCE(trial_ends_at, now())');
    });

    it('rejects zero days', async () => {
      const { svc } = makeService({ queryRows: [found, updated] });
      await expect(svc.extend(row().workspace_id, { days: 0 }, 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('puts the practice back on trial so the guard stops blocking it', async () => {
      const { svc, prisma } = makeService({ queryRows: [found, updated] });
      await svc.extend(row().workspace_id, { days: 7 }, 'admin-1');
      expect((prisma.$queryRawUnsafe as Mock).mock.calls[1][0]).toContain("plan = 'trial'");
    });

    it('requires either days or a date', async () => {
      const { svc } = makeService({ queryRows: [found, updated] });
      await expect(svc.extend(row().workspace_id, {}, 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown or deleted practice', async () => {
      const { svc } = makeService({ queryRows: [[]] });
      await expect(svc.extend(row().workspace_id, { days: 7 }, 'admin-1')).rejects.toThrow(NotFoundException);
    });
  });

  it('warns with enough lead time to act, newest warning last', () => {
    expect([...TRIAL_WARN_DAYS]).toEqual([7, 3, 1]);
  });
});
