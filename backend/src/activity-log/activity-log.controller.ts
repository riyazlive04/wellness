import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ActivityLogService } from './activity-log.service';

/**
 * Read API for the activity feed.
 *
 *   GET /api/v1/workspaces/me/activity        — workspace admin feed
 *   GET /api/v1/admin/activity                — super admin platform feed
 *
 * Both are RBAC-gated. RLS provides defence-in-depth even if a handler
 * forgot to filter by workspace_id.
 */
@ApiTags('Activity Log')
@ApiBearerAuth()
@Controller({ path: '', version: '1' })
export class ActivityLogController {
  constructor(private readonly activityLog: ActivityLogService) {}

  @Get('workspaces/me/activity')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Activity feed for the caller\'s workspace.' })
  async listForWorkspace(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('actor') actor?: string,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('search') search?: string,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return {
      data: await this.activityLog.listForWorkspace(user.workspaceId, {
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
        actorUserId: actor,
        entityType,
        action,
        search,
      }),
    };
  }

  @Get('admin/activity')
  @SuperAdmin()
  @ApiOperation({ summary: 'Platform-wide activity feed for super admin.' })
  async listGlobal(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return {
      data: await this.activityLog.listGlobal({
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      }),
    };
  }
}
