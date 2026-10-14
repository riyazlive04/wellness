import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthUser } from '../types/auth-user.type';

/**
 * Suspended / deleted practice gate.
 *
 * When a super admin suspends or deletes a workspace, everyone in it — staff
 * AND clients — gets 403 instead of data (a product decision, 2026-10-14). The
 * shell reads `workspaceStatus` from /auth/me/scope to show the "practice
 * unavailable" screen; this is the half that actually holds.
 *
 * Still open, so the screen can render and an owner can take their data:
 *   - auth (sign in, scope), health, push, webhooks
 *   - workspaces/me (practice name for the screen)
 *   - workspaces/me/data (DPDP export of their own records)
 *
 * Super admins are never blocked. The status comes from the cached AuthUser,
 * which AdminService invalidates for every member and client on a change.
 */

const OPEN_PREFIXES = ['auth', 'health', 'push', 'webhooks', 'workspaces/me/data'];

function routePath(url: string): string {
  return url.split('?')[0].replace(/^\/+/, '').replace(/^api\/(v\d+\/)?/, '');
}

function isOpen(url: string): boolean {
  const path = routePath(url);
  if (path === 'workspaces/me') return true;
  return OPEN_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export class WorkspaceUnavailableException extends HttpException {
  constructor(status: 'suspended' | 'deleted') {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        error: status === 'deleted' ? 'Practice closed' : 'Practice suspended',
        code: status === 'deleted' ? 'workspace_deleted' : 'workspace_suspended',
        message:
          status === 'deleted'
            ? 'This practice has been closed on NUSI. Contact support@sirahdigital.in if you think this is a mistake.'
            : 'This practice is temporarily unavailable on NUSI. Contact support@sirahdigital.in for help.',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

@Injectable()
export class WorkspaceStatusGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    if (!user?.workspaceId || user.isSuperAdmin) return true;
    const status = user.workspaceStatus;
    if (status !== 'suspended' && status !== 'deleted') return true;
    if (isOpen(String(req.originalUrl ?? req.url ?? ''))) return true;
    throw new WorkspaceUnavailableException(status);
  }
}
