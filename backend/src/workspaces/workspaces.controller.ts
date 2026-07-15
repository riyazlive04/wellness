import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PushService } from '../clients/push.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceSummary, WorkspacesService } from './workspaces.service';
import { VerificationService } from '../verification/verification.service';
import { workspaceCanWhiteLabel } from '../billing/workspace-addons';
import { PrismaService } from '../database/prisma.service';

class StaffPushSubscribeDto {
  @IsString() endpoint!: string;
  @IsString() p256dh!: string;
  @IsString() auth!: string;
  @IsOptional() @IsString() @MaxLength(500) user_agent?: string;
}

class StaffPushUnsubscribeDto {
  @IsString() endpoint!: string;
}

@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller({ path: 'workspaces', version: '1' })
export class WorkspacesController {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly verification: VerificationService,
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /**
   * Create a workspace and make the caller its owner. Used by the
   * onboarding wizard's final step. Idempotent: if the caller already
   * owns an active workspace, returns it.
   */
  @Post()
  @ApiOperation({ summary: 'Create a workspace; caller becomes owner.' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWorkspaceDto,
  ): Promise<{ data: WorkspaceSummary }> {
    const ws = await this.workspaces.createForOwner(user.id, dto);
    return { data: ws };
  }

  /** Read the caller's primary workspace. */
  @Get('me')
  @ApiOperation({ summary: "Read the caller's primary workspace." })
  async me(@CurrentUser() user: AuthUser): Promise<{ data: WorkspaceSummary }> {
    const ws = await this.workspaces.getForUser(user.id);
    return { data: ws };
  }

  /** List members of the caller's primary workspace. */
  @Get('me/members')
  @ApiOperation({ summary: 'List active members of the caller\'s workspace.' })
  async myMembers(@CurrentUser() user: AuthUser) {
    const ws = await this.workspaces.getForUser(user.id);
    const members = await this.workspaces.listMembers(ws.id);
    return { data: members };
  }

  /**
   * Branding for the caller's workspace — readable by ANY member, including
   * clients (who aren't in workspace_members), so the client portal can theme
   * itself. Resolves via the JWT's workspaceId rather than a membership lookup.
   */
  @Get('me/branding')
  @ApiOperation({ summary: "Branding for the caller's workspace (clients included)." })
  async myBranding(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) return { data: null };
    const ws = await this.workspaces.getById(user.workspaceId);
    // Verified flag lets the client portal show a trust badge on the practice.
    // Non-fatal: a verification lookup failure must not break theming.
    let verified = false;
    try {
      const v = await this.verification.getForWorkspace(user.workspaceId);
      verified = v.status === 'verified';
    } catch {
      verified = false;
    }
    return {
      data: {
        name: ws.display_name ?? ws.name,
        logo_url: ws.logo_url,
        brand_color: ws.brand_color,
        brand_accent: ws.brand_accent,
        tagline: ws.tagline,
        // Render-side enforcement: only report white-label if the plan still
        // allows it OR the white_label add-on is active, so a downgrade
        // auto-restores SIRAH LIFE branding but a paying add-on customer keeps
        // their branding.
        white_label: ws.white_label && (await workspaceCanWhiteLabel(this.prisma, ws.id, ws.plan)),
        verified,
      },
    };
  }

  /** Update branding / contact / GST fields. Owners only (or super_admin). */
  @Patch('me')
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'Update the caller\'s workspace (owner-only).' })
  async updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateWorkspaceDto,
  ): Promise<{ data: WorkspaceSummary }> {
    // status changes require super_admin
    if (dto.status !== undefined && !user.isSuperAdmin) {
      throw new ForbiddenException('Only super_admin can change workspace status.');
    }
    const ws = await this.workspaces.getForUser(user.id);
    // White-label is gated by plan OR the white_label add-on — block enabling it
    // for anyone with neither.
    if (dto.white_label === true && !(await workspaceCanWhiteLabel(this.prisma, ws.id, ws.plan))) {
      throw new ForbiddenException(
        'White-label branding is included with Scale Pro, or available as an add-on on Growth. Upgrade or add it to enable.',
      );
    }
    const updated = await this.workspaces.update(ws.id, dto);
    return { data: updated };
  }

  // ── Staff push notifications ─────────────────────────────────────

  @Get('me/push/config')
  @ApiOperation({ summary: 'VAPID public key for staff browser push subscription.' })
  pushConfig() {
    return { data: this.push.getPublicConfig() };
  }

  @Post('me/push/subscribe')
  @WorkspaceRole('owner', 'nutritionist', 'assistant_nutritionist', 'receptionist', 'coach', 'support', 'manager')
  @ApiOperation({ summary: "Register a staff device for this workspace's push notifications." })
  async pushSubscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: StaffPushSubscribeDto,
  ) {
    const ws = await this.workspaces.getForUser(user.id);
    return {
      data: await this.push.saveSubscription({
        userId: user.id,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: dto.user_agent ?? null,
        clientId: null,
        workspaceId: ws.id,
      }),
    };
  }

  @Post('me/push/unsubscribe')
  @WorkspaceRole('owner', 'nutritionist', 'assistant_nutritionist', 'receptionist', 'coach', 'support', 'manager')
  @ApiOperation({ summary: 'Remove a staff push subscription for the caller.' })
  async pushUnsubscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: StaffPushUnsubscribeDto,
  ) {
    return { data: await this.push.removeSubscription({ userId: user.id }, dto.endpoint) };
  }

  /**
   * Update a specific workspace by id. Super admin only (cross-tenant).
   * Used by the platform admin dashboard for plan changes, suspensions, etc.
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update any workspace by id (super_admin only).' })
  async updateById(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
  ): Promise<{ data: WorkspaceSummary }> {
    if (!user.isSuperAdmin) {
      throw new ForbiddenException('Super admin only.');
    }
    const ws = await this.workspaces.update(id, dto);
    return { data: ws };
  }
}
