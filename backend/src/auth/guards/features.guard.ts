import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_FEATURE_KEY } from '../decorators/require-feature.decorator';
import { AuthUser } from '../types/auth-user.type';
import { LimitsService } from '../../tenancy/limits.service';
import { Feature, FeatureLockedException, planHasFeature } from '../../common/features';

/**
 * Plan-entitlement guard (runs after RolesGuard). Enforces @RequireFeature by
 * resolving the caller's workspace plan and checking it includes every required
 * feature. Async — but only touches the DB on routes that actually declare a
 * feature requirement; every other route is a zero-cost pass-through.
 *
 * Bypass: super admins only. Org owners/admins used to bypass too, which let
 * anyone who once created an org on Scale Pro keep every paid feature after
 * downgrading. They now get a feature when their current workspace OR any
 * workspace in their organization is on a plan that includes it.
 */
@Injectable()
export class FeaturesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limits: LimitsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Feature[]>(REQUIRE_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) throw new ForbiddenException('No authenticated user');

    if (user.isSuperAdmin) return true;

    // No workspace → treat as the most restrictive (trial) plan.
    const plan = user.workspaceId ? await this.limits.resolvePlan(user.workspaceId) : 'trial';
    const plans = [plan];
    const orgRole = user.organizationId ? user.organizationRoles[user.organizationId] : undefined;
    if (user.organizationId && (orgRole === 'org_owner' || orgRole === 'org_admin')) {
      plans.push(...(await this.limits.resolveOrganizationPlans(user.organizationId)));
    }

    const missing = required.filter((f) => !plans.some((p) => planHasFeature(p, f)));
    if (missing.length > 0) {
      throw new FeatureLockedException(missing[0], plan);
    }
    return true;
  }
}
