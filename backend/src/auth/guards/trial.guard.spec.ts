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

function buildGuard(opts: { plan?: string; trialEndsAt?: Date | null; isPublic?: boolean } = {}) {
  const reflector = { getAllAndOverride: () => opts.isPublic ?? false } as unknown as Reflector;
  const prisma = {
    // resolveWorkspacePlan() runs raw SQL; return the plan it would resolve to.
    $queryRawUnsafe: async () => [{ plan: opts.plan ?? 'trial', sub_plan: null }],
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

  it('exempts super admins, clients and org admins', async () => {
    const guard = buildGuard({ trialEndsAt: expired });
    const cases: Array<Partial<AuthUser>> = [
      { ...staff, isSuperAdmin: true },
      { ...staff, isClient: true },
      { ...staff, organizationId: 'org-1', organizationRoles: { 'org-1': 'org_owner' } as never },
    ];
    for (const user of cases) {
      await expect(guard.canActivate(contextFor('/api/v1/clients', user))).resolves.toBe(true);
    }
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
