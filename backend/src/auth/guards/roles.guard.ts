import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { SUPER_ADMIN_KEY } from '../decorators/super-admin.decorator';
import { WORKSPACE_ROLE_KEY } from '../decorators/workspace-role.decorator';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { AuthUser, WorkspaceMemberRole } from '../types/auth-user.type';

/**
 * Global RBAC guard. Runs after JwtAuthGuard (which sets req.user). Honors:
 *   - @Roles('admin', 'client', ...)   → legacy app_role check
 *   - @SuperAdmin()                    → user.isSuperAdmin must be true
 *   - @WorkspaceRole('owner', ...)     → user.workspaceRole must match one
 *   - @RequirePermission('x.y', ...)   → user.permissions must include ALL
 *
 * If a route has NONE of these decorators, the guard is a no-op.
 *
 * "Tenant admin" bypass: super admins, and org_owner/org_admin of the
 * workspace's parent org, satisfy BOTH @WorkspaceRole and @RequirePermission —
 * they can act anywhere in their tenant.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const klass = context.getClass();

    const requiresSuperAdmin = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_KEY, [handler, klass]);
    const requiredAppRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [handler, klass]);
    const requiredWorkspaceRoles = this.reflector.getAllAndOverride<WorkspaceMemberRole[]>(WORKSPACE_ROLE_KEY, [handler, klass]);
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(REQUIRE_PERMISSION_KEY, [handler, klass]);

    const noChecks =
      !requiresSuperAdmin &&
      (!requiredAppRoles || requiredAppRoles.length === 0) &&
      (!requiredWorkspaceRoles || requiredWorkspaceRoles.length === 0) &&
      (!requiredPermissions || requiredPermissions.length === 0);
    if (noChecks) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) {
      throw new ForbiddenException('No authenticated user');
    }

    if (requiresSuperAdmin && !user.isSuperAdmin) {
      throw new ForbiddenException('Requires super_admin role');
    }

    if (requiredAppRoles && requiredAppRoles.length > 0) {
      const ok = requiredAppRoles.some((r) => user.appRoles.includes(r));
      if (!ok) {
        throw new ForbiddenException(`Requires one of app roles: ${requiredAppRoles.join(', ')}`);
      }
    }

    // Tenant-admin bypass for workspace-scoped checks (role + permission).
    const orgRole = user.organizationId ? user.organizationRoles[user.organizationId] : undefined;
    const tenantAdmin = user.isSuperAdmin || orgRole === 'org_owner' || orgRole === 'org_admin';

    if (requiredWorkspaceRoles && requiredWorkspaceRoles.length > 0 && !tenantAdmin) {
      if (!user.workspaceRole || !requiredWorkspaceRoles.includes(user.workspaceRole)) {
        throw new ForbiddenException(`Requires one of workspace roles: ${requiredWorkspaceRoles.join(', ')}`);
      }
    }

    if (requiredPermissions && requiredPermissions.length > 0 && !tenantAdmin) {
      const missing = requiredPermissions.filter((p) => !user.permissions.includes(p));
      if (missing.length > 0) {
        throw new ForbiddenException(`Missing permission(s): ${missing.join(', ')}`);
      }
    }

    return true;
  }
}
