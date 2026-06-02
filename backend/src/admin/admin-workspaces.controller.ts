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
} from './admin.service';
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

  @Post(':id/suspend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Suspend a workspace (sets status=suspended).' })
  async suspend(@Param('id') id: string) {
    return { data: await this.admin.suspend(id) };
  }

  @Post(':id/activate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Activate a suspended workspace.' })
  async activate(@Param('id') id: string) {
    return { data: await this.admin.activate(id) };
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Soft-delete a workspace (sets status=deleted).' })
  async softDelete(@Param('id') id: string) {
    return { data: await this.admin.softDelete(id) };
  }
}
