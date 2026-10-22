import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TrialGuard, TrialExpiredException } from './trial.guard';
import { AuthUser } from '../types/auth-user.type';

/**
 * The trial gate decides who still gets data once a 14-day trial is over.
 * Getting this wrong either locks out paying practices or gives free access
 * forever, so the matrix below is worth pinning down.
 */

const DAY = 86_400_000;

function contextFor(url: string, user: Partial<AuthUser> | undefined): ExecutionContext {
  const req = { url, originalUrl: url, user };
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function buildGuard(
  opts: {
    plan?: string;
    trialEndsAt?: Date | null;
    isPublic?: boolean;
    /** An 'expired' subscription exists: they paid and the renewal lapsed. */
    lapsed?: boolean;
  } = {},
) {
  const reflector = { getAllAndOverride: () => opts.isPublic ?? false } as unknown as Reflector;
  const prisma = {
    // Two different raw queries run here: resolveWorkspacePlan's, and the
    // lapsed-subscription count on the locked path. Tell them apart by SQL.
    $queryRawUnsafe: async (sql: string) =>
      /FROM public\.subscriptions/i.test(sql) && /count\(\*\)/i.test(sql)
        ? [{ n: opts.lapsed ? 1n : 0n }]
        : [{ plan: opts.plan ?? 'trial', sub_plan: null }],
    workspaces: {
      findUnique: async () => ({ trial_ends_at: opts.trialEndsAt ?? null }),
    },
  } as never;
  return new TrialGuard(reflector, prisma);
}

const staff: Partial<AuthUser> = {
  workspaceId: 'ws-1',
  workspaceRole: 'owner',
  isSuperAdmin: false,
  isClient: false,
  organizationId: null,
  organizationRoles: {},
};

describe('TrialGuard', () => {
  const expired = new Date(Date.now() - DAY);
  const running = new Date(Date.now() + 5 * DAY);

  it('blocks workspace staff once the trial has ended', async () => {
    const guard = buildGuard({ trialEndsAt: expired });
    await expect(guard.canActivate(contextFor('/api/v1/clients', staff))).rejects.toBeInstanceOf(
      TrialExpiredException,
    );
  });

  /**
   * A practice that paid for months and lost a card lands on the same guard as
   * one whose free trial ran out. Telling the first group "your 14-day free
   * trial has ended" sends them looking for a trial they never had.
   */
  it('says the free trial ended when they never subscribed', async () => {
    const guard = buildGuard({ trialEndsAt: expired, lapsed: false });
    await expect(guard.canActivate(contextFor('/api/v1/clients', staff))).rejects.toMatchObject({
      response: { code: 'trial_expired', error: 'Free trial ended' },
    });
  });

  it('says the subscription lapsed when a renewal failed through grace', async () => {
    const guard = buildGuard({ trialEndsAt: expired, lapsed: true });
    await expect(guard.canActivate(contextFor('/api/v1/clients', staff))).rejects.toMatchObject({
      response: { code: 'subscription_lapsed', error: 'Subscription lapsed' },
    });
  });

  it('lets a running trial through', async () => {
    const guard = buildGuard({ trialEndsAt: running });
    await expect(guard.canActivate(contextFor('/api/v1/clients', staff))).resolves.toBe(true);
  });

  it('never blocks a paid plan, even past the old trial date', async () => {
    const guard = buildGuard({ plan: 'growth', trialEndsAt: expired });
    await expect(guard.canActivate(contextFor('/api/v1/clients', staff))).resolves.toBe(true);
  });

  it.each([
    '/api/v1/auth/me/scope',
    '/api/v1/billing/me',
    '/api/v1/workspaces/me',
    '/api/v1/workspaces/me/data/export',
    '/api/v1/health',
  ])('keeps %s open so the practice can pay or export', async (url) => {
    const guard = buildGuard({ trialEndsAt: expired });
    await expect(guard.canActivate(contextFor(url, staff))).resolves.toBe(true);
  });

  it('still blocks other workspace routes that merely start with a similar word', async () => {
    const guard = buildGuard({ trialEndsAt: expired });
    await expect(
      guard.canActivate(contextFor('/api/v1/workspaces/me/members', staff)),
    ).rejects.toBeInstanceOf(TrialExpiredException);
  });

  it('exempts super admins and clients', async () => {
    const guard = buildGuard({ trialEndsAt: expired });
    const cases: Array<Partial<AuthUser>> = [
      { ...staff, isSuperAdmin: true },
      { ...staff, isClient: true },
    ];
    for (const user of cases) {
      await expect(guard.canActivate(contextFor('/api/v1/clients', user))).resolves.toBe(true);
    }
  });

  it('locks an org owner in an expired trial workspace like anyone else', async () => {
    const guard = buildGuard({ trialEndsAt: expired });
    const orgOwner = { ...staff, organizationId: 'org-1', organizationRoles: { 'org-1': 'org_owner' } as never };
    await expect(guard.canActivate(contextFor('/api/v1/clients', orgOwner))).rejects.toBeInstanceOf(
      TrialExpiredException,
    );
  });

  it('lets an org owner into a paid workspace', async () => {
    const guard = buildGuard({ plan: 'scale_pro', trialEndsAt: expired });
    const orgOwner = { ...staff, organizationId: 'org-1', organizationRoles: { 'org-1': 'org_owner' } as never };
    await expect(guard.canActivate(contextFor('/api/v1/clients', orgOwner))).resolves.toBe(true);
  });

  it('ignores requests with no workspace or no user', async () => {
    const guard = buildGuard({ trialEndsAt: expired });
    await expect(guard.canActivate(contextFor('/api/v1/clients', undefined))).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor('/api/v1/clients', { ...staff, workspaceId: null })),
    ).resolves.toBe(true);
  });

  it('leaves public routes alone', async () => {
    const guard = buildGuard({ trialEndsAt: expired, isPublic: true });
    await expect(guard.canActivate(contextFor('/api/v1/clients', staff))).resolves.toBe(true);
  });
});
