import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CacheService } from '../common/cache/cache.service';
import { AnalyticsService } from './analytics.service';

/**
 * Module 10 — workspace Reports & Analytics API (owner/nutritionist).
 *
 * Every endpoint is a heavy, read-mostly aggregation, so each response is
 * cached per workspace (+ query params) for a short TTL. Cache keys are
 * workspace-scoped, so tenants never see each other's numbers. The dashboard
 * tolerates being a minute stale, so we lean on TTL rather than write-time
 * invalidation. The AI `insights` call is the most expensive, so it gets a
 * longer TTL.
 */
@ApiTags('Analytics')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/analytics', version: '1' })
export class AnalyticsController {
  private static readonly TTL = 60;          // seconds - data aggregations
  private static readonly TTL_INSIGHTS = 300; // seconds - AI-generated

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly cache: CacheService,
  ) {}

  private ws(u: AuthUser): string {
    if (!u.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return u.workspaceId;
  }

  @Get('overview')
  @WorkspaceRole('owner', 'nutritionist')
  async overview(@CurrentUser() u: AuthUser) {
    const ws = this.ws(u);
    return {
      data: await this.cache.wrap(`analytics:${ws}:overview`, AnalyticsController.TTL, () =>
        this.analytics.overview(ws),
      ),
    };
  }

  @Get('client-growth')
  @WorkspaceRole('owner', 'nutritionist')
  async clientGrowth(@CurrentUser() u: AuthUser, @Query('months') months?: string) {
    const ws = this.ws(u);
    const n = months ? Number(months) : 6;
    return {
      data: await this.cache.wrap(`analytics:${ws}:client-growth:${n}`, AnalyticsController.TTL, () =>
        this.analytics.clientGrowth(ws, n),
      ),
    };
  }

  @Get('engagement')
  @WorkspaceRole('owner', 'nutritionist')
  async engagement(@CurrentUser() u: AuthUser, @Query('days') days?: string) {
    const ws = this.ws(u);
    const n = days ? Number(days) : 30;
    return {
      data: await this.cache.wrap(`analytics:${ws}:engagement:${n}`, AnalyticsController.TTL, () =>
        this.analytics.engagement(ws, n),
      ),
    };
  }

  @Get('nutrition-trends')
  @WorkspaceRole('owner', 'nutritionist')
  async nutrition(@CurrentUser() u: AuthUser, @Query('days') days?: string) {
    const ws = this.ws(u);
    const n = days ? Number(days) : 30;
    return {
      data: await this.cache.wrap(`analytics:${ws}:nutrition-trends:${n}`, AnalyticsController.TTL, () =>
        this.analytics.nutritionTrends(ws, n),
      ),
    };
  }

  @Get('program-performance')
  @WorkspaceRole('owner', 'nutritionist')
  async programs(@CurrentUser() u: AuthUser) {
    const ws = this.ws(u);
    return {
      data: await this.cache.wrap(`analytics:${ws}:program-performance`, AnalyticsController.TTL, () =>
        this.analytics.programPerformance(ws),
      ),
    };
  }

  @Get('ai-usage')
  @WorkspaceRole('owner', 'nutritionist')
  async aiUsage(@CurrentUser() u: AuthUser, @Query('days') days?: string) {
    const ws = this.ws(u);
    const n = days ? Number(days) : 14;
    return {
      data: await this.cache.wrap(`analytics:${ws}:ai-usage:${n}`, AnalyticsController.TTL, () =>
        this.analytics.aiUsage(ws, n),
      ),
    };
  }

  @Get('at-risk')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Active clients who have not logged a meal recently (churn risk).' })
  async atRisk(@CurrentUser() u: AuthUser, @Query('days') days?: string) {
    const ws = this.ws(u);
    const n = days ? Number(days) : 10;
    return {
      data: await this.cache.wrap(`analytics:${ws}:at-risk:${n}`, AnalyticsController.TTL, () =>
        this.analytics.atRiskClients(ws, n),
      ),
    };
  }

  @Get('revenue')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Active-subscription plan breakdown + 6-month MRR trend.' })
  async revenue(@CurrentUser() u: AuthUser) {
    const ws = this.ws(u);
    return {
      data: await this.cache.wrap(`analytics:${ws}:revenue`, AnalyticsController.TTL, () =>
        this.analytics.revenue(ws),
      ),
    };
  }

  @Get('ops')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Appointment pipeline + assessment completion funnel.' })
  async ops(@CurrentUser() u: AuthUser) {
    const ws = this.ws(u);
    return {
      data: await this.cache.wrap(`analytics:${ws}:ops`, AnalyticsController.TTL, () =>
        this.analytics.ops(ws),
      ),
    };
  }

  @Get('insights')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'AI-generated insights + recommendations from the workspace metrics.' })
  async insights(@CurrentUser() u: AuthUser) {
    const ws = this.ws(u);
    return {
      data: await this.cache.wrap(`analytics:${ws}:insights`, AnalyticsController.TTL_INSIGHTS, () =>
        this.analytics.insights(ws),
      ),
    };
  }
}
