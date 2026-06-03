import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import {
  AdminService,
  type ListWorkspacesResult,
  type PlatformStats,
  type WorkspaceDetail,
} from './admin.service';
import { Audit } from './audit/audit.decorator';
import { ListWorkspacesQuery } from './dto/list-workspaces.query';

/**
 * All endpoints here are platform-admin only. The class-level @SuperAdmin()
 * means every route refuses anyone whose AuthUser.isSuperAdmin = false,
 * regardless of workspace membership. RolesGuard enforces this globally.
 */
@ApiTags('Admin · Workspaces')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/workspaces', version: '1' })
export class AdminWorkspacesController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Platform-wide KPIs (workspace counts, members, expiring trials).' })
  async stats(): Promise<{ data: PlatformStats }> {
    return { data: await this.admin.stats() };
  }

  @Get()
  @ApiOperation({ summary: 'List workspaces with search, filter, pagination.' })
  async list(@Query() q: ListWorkspacesQuery): Promise<{ data: ListWorkspacesResult }> {
    return { data: await this.admin.listWorkspaces(q) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Full detail for one workspace: owner, members, counts, recent activity.' })
  async detail(@Param('id') id: string): Promise<{ data: WorkspaceDetail }> {
    return { data: await this.admin.workspaceDetail(id) };
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @Audit({ action: 'workspace.suspend', resourceType: 'workspace', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Suspend a workspace (sets status=suspended).' })
  async suspend(@Param('id') id: string) {
    return { data: await this.admin.suspend(id) };
  }

  @Post(':id/activate')
  @HttpCode(200)
  @Audit({ action: 'workspace.activate', resourceType: 'workspace', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Activate a suspended workspace.' })
  async activate(@Param('id') id: string) {
    return { data: await this.admin.activate(id) };
  }

  @Delete(':id')
  @HttpCode(200)
  @Audit({ action: 'workspace.soft_delete', resourceType: 'workspace', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Soft-delete a workspace (sets status=deleted).' })
  async softDelete(@Param('id') id: string) {
    return { data: await this.admin.softDelete(id) };
  }
}
