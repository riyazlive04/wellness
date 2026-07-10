import {
  Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post, Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreateMemberDto, InviteMemberDto, SetPermissionsDto, UpdateMemberRoleDto } from './dto/team.dto';
import { LimitsService } from './limits.service';
import { PermissionsService } from './permissions.service';
import { TeamService } from './team.service';

/**
 * Tenancy admin API — plan limits + team management for the caller's workspace.
 *
 *   GET    /api/v1/workspaces/me/limits                 — plan, limits, usage
 *   GET    /api/v1/workspaces/me/team/members           — staff list
 *   PATCH  /api/v1/workspaces/me/team/members/:id       — change role (owner)
 *   DELETE /api/v1/workspaces/me/team/members/:id       — remove (owner)
 *   GET    /api/v1/workspaces/me/team/invites           — staff invites
 *   POST   /api/v1/workspaces/me/team/invites           — invite (owner, limit-gated)
 *   POST   /api/v1/workspaces/me/team/invites/:id/revoke
 */
@ApiTags('Tenancy')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me', version: '1' })
export class TenancyController {
  constructor(
    private readonly limits: LimitsService,
    private readonly team: TeamService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get('limits')
  @WorkspaceRole('owner', 'nutritionist', 'manager')
  @ApiOperation({ summary: 'Plan quotas + current usage for the workspace.' })
  async getLimits(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return { data: await this.limits.snapshot(user.workspaceId) };
  }

  // ── Team members ───────────────────────────────────────────────────

  @Get('team/members')
  @WorkspaceRole('owner', 'nutritionist', 'manager')
  @ApiOperation({ summary: 'List workspace team members.' })
  async members(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return { data: await this.team.listMembers(user.workspaceId) };
  }

  @Patch('team/members/:id')
  @WorkspaceRole('owner')
  @ApiOperation({ summary: "Change a team member's role (owner only)." })
  async updateMemberRole(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return { data: await this.team.updateMemberRole(user.workspaceId, id, dto.role) };
  }

  @Post('team/members')
  @RequirePermission('team.manage')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a staff login directly (email + password) — no invite email (owner only).' })
  async createMember(@CurrentUser() user: AuthUser, @Body() dto: CreateMemberDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return { data: await this.team.createMemberDirect(user.workspaceId, user.id, dto.email, dto.password, dto.role) };
  }

  @Delete('team/members/:id')
  @WorkspaceRole('owner')
  @ApiOperation({ summary: 'Remove a team member (owner only).' })
  async removeMember(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return { data: await this.team.removeMember(user.workspaceId, id, user.id) };
  }

  // ── Team invites ───────────────────────────────────────────────────

  @Get('team/invites')
  @WorkspaceRole('owner', 'nutritionist', 'manager')
  @ApiOperation({ summary: 'List staff invitations (pending / accepted / revoked).' })
  async invites(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return { data: await this.team.listInvites(user.workspaceId) };
  }

  @Post('team/invites')
  @RequirePermission('team.manage')
  @HttpCode(201)
  @ApiOperation({ summary: 'Invite a staff member (owner only; counts against the team limit).' })
  async invite(@CurrentUser() user: AuthUser, @Body() dto: InviteMemberDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return { data: await this.team.inviteMember(user.workspaceId, user.id, dto.email, dto.role, dto.notes) };
  }

  @Post('team/invites/:id/revoke')
  @RequirePermission('team.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke a pending staff invite.' })
  async revokeInvite(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return { data: await this.team.revokeInvite(user.workspaceId, id, user.id) };
  }

  // ── Permissions ────────────────────────────────────────────────────

  @Get('permissions/catalog')
  @WorkspaceRole('owner', 'nutritionist', 'manager')
  @ApiOperation({ summary: 'Permission catalog: all permissions, groups, and role defaults.' })
  permissionCatalog() {
    return { data: this.permissions.getCatalog() };
  }

  @Get('team/members/:id/permissions')
  @WorkspaceRole('owner')
  @ApiOperation({ summary: "A member's effective permissions + overrides (owner only)." })
  async memberPermissions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return { data: await this.permissions.getMemberPermissions(user.workspaceId, id) };
  }

  @Put('team/members/:id/permissions')
  @WorkspaceRole('owner')
  @ApiOperation({ summary: "Replace a member's permission overrides (owner only)." })
  async setMemberPermissions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetPermissionsDto,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return {
      data: await this.permissions.setMemberOverrides(user.workspaceId, id, user.id, dto.overrides),
    };
  }
}
