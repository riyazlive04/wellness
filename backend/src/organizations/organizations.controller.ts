import {
  Body, Controller, Delete, ForbiddenException, Get, HttpCode,
  Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireFeature } from '../auth/decorators/require-feature.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  AddOrgMemberDto, AttachWorkspaceDto,
  CreateOrgDto, UpdateOrgDto, UpdateOrgMemberDto,
} from './dto/org.dto';
import { OrganizationsService } from './organizations.service';

/**
 * Organizations API — Platform → Organization → Workspace tier.
 *
 * Endpoints scope to the calling user; OrganizationsService enforces
 * org_owner / org_admin / org_viewer role checks server-side. No
 * additional decorator is required — every method calls assertMember or
 * assertRole internally.
 */
@ApiTags('Organizations')
@ApiBearerAuth()
@RequireFeature('organizations')
@Controller({ path: 'organizations', version: '1' })
export class OrganizationsController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List orgs the caller is an active member of.' })
  async list(@CurrentUser() user: AuthUser) {
    return { data: await this.orgs.list(user.id) };
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.orgs.get(user.id, id) };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create an organization — caller becomes org_owner.' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrgDto) {
    if (!user.id) throw new ForbiddenException();
    return { data: await this.orgs.create(user.id, dto) };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrgDto,
  ) {
    return { data: await this.orgs.update(user.id, id, dto) };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an org. Workspaces are detached (not deleted).' })
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.orgs.remove(user.id, id) };
  }

  // ── Members ──────────────────────────────────────────────────────

  @Get(':id/members')
  async listMembers(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.orgs.listMembers(user.id, id) };
  }

  @Post(':id/members')
  @HttpCode(201)
  async addMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddOrgMemberDto,
  ) {
    return { data: await this.orgs.addMember(user.id, id, dto.email, dto.role) };
  }

  @Patch(':id/members/:memberId')
  async updateMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateOrgMemberDto,
  ) {
    return { data: await this.orgs.updateMember(user.id, id, memberId, dto.role) };
  }

  @Delete(':id/members/:memberId')
  async removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    return { data: await this.orgs.removeMember(user.id, id, memberId) };
  }

  // ── Workspaces ───────────────────────────────────────────────────

  @Get(':id/workspaces')
  async listWorkspaces(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.orgs.listWorkspaces(user.id, id) };
  }

  @Post(':id/workspaces/attach')
  @HttpCode(200)
  @ApiOperation({ summary: 'Attach an existing workspace to this organization.' })
  async attachWorkspace(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AttachWorkspaceDto,
  ) {
    return { data: await this.orgs.attachWorkspace(user.id, id, dto.workspace_id) };
  }

  @Delete(':id/workspaces/:workspaceId')
  async detachWorkspace(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('workspaceId') workspaceId: string,
  ) {
    return { data: await this.orgs.detachWorkspace(user.id, id, workspaceId) };
  }

  // ── Activity audit ───────────────────────────────────────────────

  @Get(':id/activity')
  @ApiOperation({
    summary: 'Org-wide activity audit feed across all member workspaces.',
  })
  async listActivity(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('actor') actor?: string,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('search') search?: string,
  ) {
    // Any active org member (including org_viewer) may read the audit trail.
    await this.orgs.requireMembership(user.id, id);
    return {
      data: await this.activityLog.listForOrganization(id, {
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
        workspaceId,
        actorUserId: actor,
        entityType,
        action,
        search,
      }),
    };
  }
}
