import {
  ExecutionContext,
  ForbiddenException,
  createParamDecorator,
} from '@nestjs/common';
import { AuthUser } from '../types/auth-user.type';

/**
 * Inject the calling user's workspaceId. Throws 403 if the user has no
 * workspace membership. Use on every tenant-scoped endpoint to enforce that
 * the caller is operating within their own workspace.
 *
 * For super_admin endpoints that legitimately span workspaces, pull the
 * workspaceId from a path/query param and validate against AuthUser instead.
 */
export const CurrentWorkspace = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) {
      throw new ForbiddenException('No authenticated user');
    }
    if (!user.workspaceId) {
      throw new ForbiddenException(
        'User is not a member of any workspace. Create or join one before calling this endpoint.',
      );
    }
    return user.workspaceId;
  },
);
