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
    //     dashboard. Beats a stray legacy 'client' app-role on a staff account.
    //  3. The 'client' app-role → portal. This deliberately does NOT require a
    //     resolved workspaceId: a client's workspace comes from a SECONDARY,
    //     non-critical clients lookup that can transiently fail, lag a deploy, or
    //     be served stale from the auth cache. A real client must NEVER be
    //     bounced to onboarding just because that enrichment didn't resolve.
    //     (An account with the client role but no clients record also lands on
    //     the portal and renders empty — a rare test-account case, not worth
    //     risking every real client's routing over.)
    //  4. A workspace with no client role → workspace; nothing → unaffiliated.
    const tier: 'super_admin' | 'workspace' | 'client' | 'unaffiliated' =
      user.isSuperAdmin
        ? 'super_admin'
        : user.workspaceRole
          ? 'workspace'
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
        permissions: user.permissions,
      },
    };
  }
}
