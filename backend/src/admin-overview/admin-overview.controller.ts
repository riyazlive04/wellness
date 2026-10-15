import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { AdminOverviewService } from './admin-overview.service';

@ApiTags('Admin · Overview')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/overview', version: '1' })
export class AdminOverviewController {
  constructor(private readonly svc: AdminOverviewService) {}

  @Get()
  @ApiOperation({ summary: 'Everything the super admin home page shows, in one request.' })
  async get() {
    return { data: await this.svc.overview() };
  }

  @Get('practices')
  @ApiOperation({ summary: 'Every practice with plan, trial, setup fee, client activity, AI use and health (Workspaces page).' })
  async practices() {
    return { data: await this.svc.directory() };
  }
}
