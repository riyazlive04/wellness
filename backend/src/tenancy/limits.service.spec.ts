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
}) {
  return {
    $queryRawUnsafe: jest.fn((sql: string) => {
      if (sql.includes('subscriptions')) {
        return Promise.resolve([{ plan: opts.plan ?? 'trial', sub_plan: opts.subPlan ?? null }]);
      }
      // usage aggregate
      return Promise.resolve([
        {
          clients: BigInt(opts.clients ?? 0),
          team: BigInt(opts.team ?? 0),
          ai_calls: BigInt(opts.aiCalls ?? 0),
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
      expect(limitsForPlan('starter').maxClients).toBe(25);
      expect(limitsForPlan('enterprise').maxClients).toBeNull();
      expect(limitsForPlan('trial')).toEqual(TRIAL_LIMITS);
      expect(limitsForPlan('nonsense')).toEqual(TRIAL_LIMITS);
      expect(limitsForPlan(null)).toEqual(TRIAL_LIMITS);
    });
  });

  describe('resolvePlan', () => {
    it('prefers an active subscription plan over workspaces.plan', async () => {
      const svc = await makeService(makePrisma({ plan: 'starter', subPlan: 'scale' }));
      expect(await svc.resolvePlan('ws')).toBe('scale');
    });
    it('falls back to workspaces.plan when no subscription', async () => {
      const svc = await makeService(makePrisma({ plan: 'pro', subPlan: null }));
      expect(await svc.resolvePlan('ws')).toBe('pro');
    });
  });

  describe('assertCanAddClient', () => {
    it('throws a 402 PlanLimitException at the cap', async () => {
      const svc = await makeService(makePrisma({ plan: 'starter', clients: 25 }));
      await expect(svc.assertCanAddClient('ws')).rejects.toBeInstanceOf(PlanLimitException);
      await svc.assertCanAddClient('ws').catch((e: PlanLimitException) => {
        expect(e.getStatus()).toBe(402);
        expect((e.getResponse() as { resource: string }).resource).toBe('clients');
      });
    });
    it('allows under the cap', async () => {
      const svc = await makeService(makePrisma({ plan: 'starter', clients: 24 }));
      await expect(svc.assertCanAddClient('ws')).resolves.toBeUndefined();
    });
    it('never blocks on an unlimited plan', async () => {
      const svc = await makeService(makePrisma({ plan: 'enterprise', clients: 99999 }));
      await expect(svc.assertCanAddClient('ws')).resolves.toBeUndefined();
    });
  });

  describe('assertCanAddTeamMember', () => {
    it('blocks at the team cap (trial = 2)', async () => {
      const svc = await makeService(makePrisma({ plan: 'trial', team: 2 }));
      await expect(svc.assertCanAddTeamMember('ws')).rejects.toBeInstanceOf(PlanLimitException);
    });
  });

  describe('assertAiQuota', () => {
    it('blocks when the monthly AI budget is spent', async () => {
      const svc = await makeService(makePrisma({ plan: 'starter', aiCalls: 1000 }));
      await expect(svc.assertAiQuota('ws')).rejects.toBeInstanceOf(PlanLimitException);
    });
    it('is a no-op when there is no workspace', async () => {
      const svc = await makeService(makePrisma({}));
      await expect(svc.assertAiQuota(null)).resolves.toBeUndefined();
    });
  });

  describe('snapshot', () => {
    it('computes remaining per quota and null for unlimited', async () => {
      const svc = await makeService(makePrisma({ plan: 'pro', clients: 40, team: 1, aiCalls: 500 }));
      const snap = await svc.snapshot('ws');
      expect(snap.plan).toBe('pro');
      expect(snap.remaining.clients).toBe(60); // 100 - 40
      expect(snap.remaining.team).toBe(2); // 3 - 1
      expect(snap.remaining.aiCallsThisMonth).toBe(4500); // 5000 - 500
    });
  });
});
