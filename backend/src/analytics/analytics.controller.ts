import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { AnalyticsService } from './analytics.service';

/**
 * Module 10 — workspace Reports & Analytics API (owner/nutritionist).
 */
@ApiTags('Analytics')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/analytics', version: '1' })
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  private ws(u: AuthUser): string {
    if (!u.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return u.workspaceId;
  }

  @Get('overview')
  @WorkspaceRole('owner', 'nutritionist')
  async overview(@CurrentUser() u: AuthUser) {
    return { data: await this.analytics.overview(this.ws(u)) };
  }

  @Get('client-growth')
  @WorkspaceRole('owner', 'nutritionist')
  async clientGrowth(@CurrentUser() u: AuthUser, @Query('months') months?: string) {
    return { data: await this.analytics.clientGrowth(this.ws(u), months ? Number(months) : 6) };
  }

  @Get('engagement')
  @WorkspaceRole('owner', 'nutritionist')
  async engagement(@CurrentUser() u: AuthUser, @Query('days') days?: string) {
    return { data: await this.analytics.engagement(this.ws(u), days ? Number(days) : 30) };
  }

  @Get('nutrition-trends')
  @WorkspaceRole('owner', 'nutritionist')
  async nutrition(@CurrentUser() u: AuthUser, @Query('days') days?: string) {
    return { data: await this.analytics.nutritionTrends(this.ws(u), days ? Number(days) : 30) };
  }

  @Get('program-performance')
  @WorkspaceRole('owner', 'nutritionist')
  async programs(@CurrentUser() u: AuthUser) {
    return { data: await this.analytics.programPerformance(this.ws(u)) };
  }

  @Get('ai-usage')
  @WorkspaceRole('owner', 'nutritionist')
  async aiUsage(@CurrentUser() u: AuthUser, @Query('days') days?: string) {
    return { data: await this.analytics.aiUsage(this.ws(u), days ? Number(days) : 14) };
  }

  @Get('insights')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'AI-generated insights + recommendations from the workspace metrics.' })
  async insights(@CurrentUser() u: AuthUser) {
    return { data: await this.analytics.insights(this.ws(u)) };
  }
}
