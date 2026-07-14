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
      /** Effective fine-grained permissions — drives permission-aware UI gating. */
      permissions: string[];
    };
  }> {
    // Order matters:
    //  1. super_admin wins outright.
    //  2. A workspace ROLE (owner / nutritionist / manager) means STAFF → the
    //     dashboard. This takes precedence over a stray legacy 'client' app-role
    //     that ensure_user_role may have assigned to a staff account — otherwise
    //     a nutritionist gets misrouted to the client portal.
    //  3. Only an account with the 'client' role AND a workspace but NO staff
    //     role is a genuine client → portal (real clients have workspaceRole=null).
    //  4. A workspace with no client role → workspace; nothing → unaffiliated
    //     (client-role-without-a-workspace also lands here → onboarding, not a
    //     broken portal that 404s every /me/* call).
    const tier: 'super_admin' | 'workspace' | 'client' | 'unaffiliated' =
      user.isSuperAdmin
        ? 'super_admin'
        : user.workspaceRole
          ? 'workspace'
          : user.isClient && user.workspaceId
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
        permissions: user.permissions,
      },
    };
  }
}
