import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeaturesGuard } from './features.guard';
import { AuthUser } from '../types/auth-user.type';
import { Feature, FeatureLockedException } from '../../common/features';

/**
 * The plan-feature gate decides what a paying tier unlocks. Org owners/admins
 * used to skip it entirely, so anyone who had once created an organization on
 * Scale Pro kept every paid feature after downgrading. These pin the fix.
 */

function contextFor(user: Partial<AuthUser> | undefined): ExecutionContext {
  const req = { user };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function buildGuard(required: Feature[], opts: { plan?: string; orgPlans?: string[] } = {}) {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  const orgLookups: string[] = [];
  const limits = {
    resolvePlan: async () => opts.plan ?? 'trial',
    resolveOrganizationPlans: async (orgId: string) => (orgLookups.push(orgId), opts.orgPlans ?? []),
  };
  return { guard: new FeaturesGuard(reflector, limits as never), orgLookups };
}

const owner: Partial<AuthUser> = {
  workspaceId: 'ws-1',
  workspaceRole: 'owner',
  isSuperAdmin: false,
  organizationId: null,
  organizationRoles: {},
};
const orgOwner: Partial<AuthUser> = {
  ...owner,
  organizationId: 'org-1',
  organizationRoles: { 'org-1': 'org_owner' } as never,
};

describe('FeaturesGuard', () => {
  it('lets routes without a feature requirement through', async () => {
    const { guard } = buildGuard([]);
    await expect(guard.canActivate(contextFor(owner))).resolves.toBe(true);
  });

  it('allows a feature the workspace plan includes', async () => {
    const { guard } = buildGuard(['community'], { plan: 'growth' });
    await expect(guard.canActivate(contextFor(owner))).resolves.toBe(true);
  });

  it('refuses a feature the workspace plan does not include', async () => {
    const { guard } = buildGuard(['community'], { plan: 'starter' });
    await expect(guard.canActivate(contextFor(owner))).rejects.toBeInstanceOf(FeatureLockedException);
  });

  it('still lets super admins through anything', async () => {
    const { guard } = buildGuard(['organizations'], { plan: 'starter' });
    await expect(guard.canActivate(contextFor({ ...owner, isSuperAdmin: true }))).resolves.toBe(true);
  });

  it('no longer lets an org owner bypass the plan when no branch pays for the feature', async () => {
    const { guard } = buildGuard(['organizations'], { plan: 'starter', orgPlans: ['starter', 'trial'] });
    await expect(guard.canActivate(contextFor(orgOwner))).rejects.toBeInstanceOf(FeatureLockedException);
  });

  it('lets an org owner use a feature that any branch in the organization pays for', async () => {
    const { guard, orgLookups } = buildGuard(['organizations'], { plan: 'trial', orgPlans: ['growth', 'scale_pro'] });
    await expect(guard.canActivate(contextFor(orgOwner))).resolves.toBe(true);
    expect(orgLookups).toEqual(['org-1']);
  });

  it('does not look at organization plans for a plain workspace member', async () => {
    const member = { ...owner, organizationId: 'org-1', organizationRoles: { 'org-1': 'org_member' } as never };
    const { guard, orgLookups } = buildGuard(['organizations'], { plan: 'starter', orgPlans: ['scale_pro'] });
    await expect(guard.canActivate(contextFor(member))).rejects.toBeInstanceOf(FeatureLockedException);
    expect(orgLookups).toEqual([]);
  });
});
