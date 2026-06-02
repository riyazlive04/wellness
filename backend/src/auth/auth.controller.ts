import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUser } from './types/auth-user.type';

@ApiTags('auth')
@ApiBearerAuth()
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  @Get('me')
  @ApiOperation({ summary: 'Return the currently authenticated user.' })
  me(@CurrentUser() user: AuthUser): { data: AuthUser } {
    return { data: user };
  }

  /**
   * Compact scope view — useful for the frontend to decide which shell
   * (Super Admin / Workspace / Client) to render, without leaking auxiliary
   * fields. Subset of /me.
   */
  @Get('me/scope')
  @ApiOperation({
    summary: 'Compact RBAC scope of the calling user (tier + workspace + role).',
  })
  scope(@CurrentUser() user: AuthUser): {
    data: {
      userId: string;
      email?: string;
      tier: 'super_admin' | 'workspace' | 'client' | 'unaffiliated';
      workspaceId: string | null;
      workspaceRole: string | null;
      isSuperAdmin: boolean;
      isClient: boolean;
      appRoles: string[];
    };
  } {
    const tier: 'super_admin' | 'workspace' | 'client' | 'unaffiliated' =
      user.isSuperAdmin
        ? 'super_admin'
        : user.isClient
          ? 'client'
          : user.workspaceId
            ? 'workspace'
            : 'unaffiliated';

    return {
      data: {
        userId: user.id,
        email: user.email,
        tier,
        workspaceId: user.workspaceId,
        workspaceRole: user.workspaceRole,
        isSuperAdmin: user.isSuperAdmin,
        isClient: user.isClient,
        appRoles: user.appRoles,
      },
    };
  }
}
