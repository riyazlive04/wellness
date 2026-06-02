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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceSummary, WorkspacesService } from './workspaces.service';

@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller({ path: 'workspaces', version: '1' })
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

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
    const updated = await this.workspaces.update(ws.id, dto);
    return { data: updated };
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
