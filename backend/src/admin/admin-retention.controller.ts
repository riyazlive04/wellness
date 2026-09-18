import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { RetentionService, type PurgeQueue } from './retention.service';

/**
 * Abandoned-trial retention, platform-admin only.
 *
 * Read-only for now: it reports which workspaces are heading for deletion and
 * when. The purge itself, and the warning emails, land on top of this list.
 */
@ApiTags('Admin · Retention')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin/retention', version: '1' })
export class AdminRetentionController {
  constructor(private readonly retention: RetentionService) {}

  @Get('purge-queue')
  @ApiOperation({ summary: 'Workspaces whose trial lapsed unpaid, with their deletion dates.' })
  async purgeQueue(): Promise<{ data: PurgeQueue }> {
    return { data: await this.retention.purgeQueue() };
  }
}
