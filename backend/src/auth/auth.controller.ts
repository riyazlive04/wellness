import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUser } from './types/auth-user.type';
import { PrismaService } from '../database/prisma.service';
import { resolveWorkspacePlan } from '../billing/resolve-plan';

@ApiTags('auth')
@ApiBearerAuth()
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

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
    summary: 'Compact RBAC scope of the calling user (tier + workspace + role + plan).',
  })
  async scope(@CurrentUser() user: AuthUser): Promise<{
    data: {
      userId: string;
      email?: string;
      tier: 'super_admin' | 'workspace' | 'client' | 'unaffiliated';
      workspaceId: string | null;
      workspaceRole: string | null;
      /** Effective plan key of the primary workspace — drives frontend feature gating. */
      plan: string | null;
      isSuperAdmin: boolean;
      isClient: boolean;
      appRoles: string[];
    };
  }> {
    const tier: 'super_admin' | 'workspace' | 'client' | 'unaffiliated' =
      user.isSuperAdmin
        ? 'super_admin'
        : user.isClient
          ? 'client'
          : user.workspaceId
            ? 'workspace'
            : 'unaffiliated';

    const plan = user.workspaceId
      ? await resolveWorkspacePlan(this.prisma, user.workspaceId)
      : null;

    return {
      data: {
        userId: user.id,
        email: user.email,
        tier,
        workspaceId: user.workspaceId,
        workspaceRole: user.workspaceRole,
        plan,
        isSuperAdmin: user.isSuperAdmin,
        isClient: user.isClient,
        appRoles: user.appRoles,
      },
    };
  }
}
