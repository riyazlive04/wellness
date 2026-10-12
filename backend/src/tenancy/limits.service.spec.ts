import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { LimitsService, PlanLimitException } from './limits.service';
import { limitsForPlan, TRIAL_LIMITS } from '../billing/plans';

/**
 * LimitsService — plan resolution + quota enforcement.
 *
 * The DB reads are mocked by inspecting the SQL: the plan-resolution query
 * mentions `subscriptions`; the usage query selects `count(*)`. This keeps the
 * tests on the enforcement logic (which is what must never regress) rather than
 * on SQL plumbing.
 */
function makePrisma(opts: {
  plan?: string | null;
  subPlan?: string | null;
  clients?: number;
  team?: number;
  aiCalls?: number;
  videoMinutes?: number;
  /** The appointment was already counted (someone joined before). */
  videoCharged?: boolean;
}) {
  return {
    $executeRawUnsafe: jest.fn(() => Promise.resolve(1)),
    $queryRawUnsafe: jest.fn((sql: string) => {
      if (sql.includes('FROM public.video_usage WHERE appointment_id')) {
        return Promise.resolve(opts.videoCharged ? [{ id: 'v1' }] : []);
      }
      if (sql.includes('subscriptions')) {
        return Promise.resolve([{ plan: opts.plan ?? 'trial', sub_plan: opts.subPlan ?? null }]);
      }
      // usage aggregate
      return Promise.resolve([
        {
          clients: BigInt(opts.clients ?? 0),
          team: BigInt(opts.team ?? 0),
          ai_calls: BigInt(opts.aiCalls ?? 0),
          video_minutes: BigInt(opts.videoMinutes ?? 0),
        },
      ]);
    }),
  };
}

async function makeService(prisma: ReturnType<typeof makePrisma>): Promise<LimitsService> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [LimitsService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return moduleRef.get(LimitsService);
}

describe('LimitsService', () => {
  describe('plans catalog', () => {
    it('maps known plans to their limits and falls back to trial', () => {
      expect(limitsForPlan('basic').maxClients).toBe(50);
      expect(limitsForPlan('elite').maxClients).toBeNull();
      expect(limitsForPlan('trial')).toEqual(TRIAL_LIMITS);
      expect(limitsForPlan('nonsense')).toEqual(TRIAL_LIMITS);
      expect(limitsForPlan(null)).toEqual(TRIAL_LIMITS);
    });
  });

  describe('resolvePlan', () => {
    it('prefers an active subscription plan over workspaces.plan', async () => {
      const svc = await makeService(makePrisma({ plan: 'basic', subPlan: 'elite' }));
      expect(await svc.resolvePlan('ws')).toBe('elite');
    });
    it('falls back to workspaces.plan when no subscription', async () => {
      const svc = await makeService(makePrisma({ plan: 'pro', subPlan: null }));
      expect(await svc.resolvePlan('ws')).toBe('pro');
    });
  });

  describe('assertCanAddClient', () => {
    it('throws a 402 PlanLimitException at the cap', async () => {
      const svc = await makeService(makePrisma({ plan: 'basic', clients: 50 }));
      await expect(svc.assertCanAddClient('ws')).rejects.toBeInstanceOf(PlanLimitException);
      await svc.assertCanAddClient('ws').catch((e: PlanLimitException) => {
        expect(e.getStatus()).toBe(402);
        expect((e.getResponse() as { resource: string }).resource).toBe('clients');
      });
    });
    it('allows under the cap', async () => {
      const svc = await makeService(makePrisma({ plan: 'basic', clients: 49 }));
      await expect(svc.assertCanAddClient('ws')).resolves.toBeUndefined();
    });
    it('never blocks on an unlimited plan', async () => {
      const svc = await makeService(makePrisma({ plan: 'elite', clients: 99999 }));
      await expect(svc.assertCanAddClient('ws')).resolves.toBeUndefined();
    });
  });

  describe('assertCanAddTeamMember', () => {
    it('blocks at the team cap (trial = 5)', async () => {
      const svc = await makeService(makePrisma({ plan: 'trial', team: 5 }));
      await expect(svc.assertCanAddTeamMember('ws')).rejects.toBeInstanceOf(PlanLimitException);
    });
  });

  describe('assertAiQuota', () => {
    it('blocks when the monthly AI budget is spent', async () => {
      const svc = await makeService(makePrisma({ plan: 'basic', aiCalls: 3000 }));
      await expect(svc.assertAiQuota('ws')).rejects.toBeInstanceOf(PlanLimitException);
    });
    it('is a no-op when there is no workspace', async () => {
      const svc = await makeService(makePrisma({}));
      await expect(svc.assertAiQuota(null)).resolves.toBeUndefined();
    });
  });

  describe('chargeVideoCall', () => {
    it('counts a new call at its booked length', async () => {
      const prisma = makePrisma({ plan: 'growth', videoMinutes: 100 });
      const svc = await makeService(prisma);
      await svc.chargeVideoCall('ws', 'appt', 30);
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO public.video_usage'), 'ws', 'appt', 30);
    });
    it('blocks a new call once the monthly hours are used up (Growth = 30 h)', async () => {
      const svc = await makeService(makePrisma({ plan: 'growth', videoMinutes: 30 * 60 }));
      await expect(svc.chargeVideoCall('ws', 'appt', 30)).rejects.toBeInstanceOf(PlanLimitException);
      await svc.chargeVideoCall('ws', 'appt', 30).catch((e: PlanLimitException) => {
        expect(e.getStatus()).toBe(402);
        expect((e.getResponse() as { resource: string }).resource).toBe('video_minutes');
      });
    });
    it('lets a call already counted be re-joined, even at the limit', async () => {
      const prisma = makePrisma({ plan: 'growth', videoMinutes: 30 * 60, videoCharged: true });
      const svc = await makeService(prisma);
      await expect(svc.chargeVideoCall('ws', 'appt', 30)).resolves.toBeUndefined();
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });
    it('has no video on Starter', async () => {
      const svc = await makeService(makePrisma({ plan: 'starter' }));
      await expect(svc.chargeVideoCall('ws', 'appt', 30)).rejects.toBeInstanceOf(PlanLimitException);
    });
    it('gives each plan its monthly hours', () => {
      expect(limitsForPlan('trial').videoMinutesPerMonth).toBe(5 * 60);
      expect(limitsForPlan('growth').videoMinutesPerMonth).toBe(30 * 60);
      expect(limitsForPlan('scale_pro').videoMinutesPerMonth).toBe(100 * 60);
      expect(limitsForPlan('starter').videoMinutesPerMonth).toBe(0);
    });
  });

  describe('snapshot', () => {
    it('computes remaining per quota and null for unlimited', async () => {
      const svc = await makeService(makePrisma({ plan: 'pro', clients: 40, team: 1, aiCalls: 500 }));
      const snap = await svc.snapshot('ws');
      expect(snap.plan).toBe('pro');
      expect(snap.remaining.clients).toBe(110); // 150 - 40
      expect(snap.remaining.team).toBe(7); // 8 - 1
      expect(snap.remaining.aiCallsThisMonth).toBe(11500); // 12000 - 500
    });
  });
});
