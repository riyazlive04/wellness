import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { SUPER_ADMIN_KEY } from '../decorators/super-admin.decorator';
import { WORKSPACE_ROLE_KEY } from '../decorators/workspace-role.decorator';
import { AuthUser, WorkspaceMemberRole } from '../types/auth-user.type';

/**
 * Global RBAC guard. Runs after JwtAuthGuard (which sets req.user). Honors:
 *   - @Roles('admin', 'client', ...) → legacy app_role check
 *   - @SuperAdmin()                  → user.isSuperAdmin must be true
 *   - @WorkspaceRole('owner', ...)   → user.workspaceRole must match one
 *
 * If a route has NONE of these decorators, the guard is a no-op.
 * Super admins implicitly satisfy @WorkspaceRole — they can act anywhere.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const klass = context.getClass();

    const requiresSuperAdmin = this.reflector.getAllAndOverride<boolean>(
      SUPER_ADMIN_KEY,
      [handler, klass],
    );
    const requiredAppRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [handler, klass],
    );
    const requiredWorkspaceRoles = this.reflector.getAllAndOverride<WorkspaceMemberRole[]>(
      WORKSPACE_ROLE_KEY,
      [handler, klass],
    );

    const noChecks =
      !requiresSuperAdmin &&
      (!requiredAppRoles || requiredAppRoles.length === 0) &&
      (!requiredWorkspaceRoles || requiredWorkspaceRoles.length === 0);
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
        throw new ForbiddenException(
          `Requires one of app roles: ${requiredAppRoles.join(', ')}`,
        );
      }
    }

    if (requiredWorkspaceRoles && requiredWorkspaceRoles.length > 0) {
      // Super admins bypass workspace-role checks — they can act anywhere.
      if (user.isSuperAdmin) return true;
      if (!user.workspaceRole || !requiredWorkspaceRoles.includes(user.workspaceRole)) {
        throw new ForbiddenException(
          `Requires one of workspace roles: ${requiredWorkspaceRoles.join(', ')}`,
        );
      }
    }

    return true;
  }
}
