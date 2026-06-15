import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { Audit } from '../admin/audit/audit.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { EnterpriseAiService } from './enterprise-ai.service';

class RecStatusDto {
  @IsIn(['applied', 'dismissed', 'new']) status!: 'applied' | 'dismissed' | 'new';
}
class ReviewDto {
  @IsIn(['approve', 'reject']) decision!: 'approve' | 'reject';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/**
 * Module 12 — Enterprise AI Ecosystem (workspace surface): the AI recommendation
 * store, the governance approval queue, and unified AI analytics.
 */
@ApiTags('AI Ecosystem')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/ai-ecosystem', version: '1' })
export class EnterpriseAiController {
  constructor(private readonly ai: EnterpriseAiService) {}

  @Get('recommendations')
  @WorkspaceRole('owner', 'nutritionist')
  async listRecs(@CurrentUser() u: AuthUser) {
    return { data: await this.ai.listRecommendations(u) };
  }

  @Post('recommendations/generate')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(201)
  @Audit({ action: 'ai.recommendations.generate', resourceType: 'ai_recommendation' })
  @ApiOperation({ summary: 'Generate fresh AI recommendations from workspace data.' })
  async generate(@CurrentUser() u: AuthUser) {
    return { data: await this.ai.generateRecommendations(u) };
  }

  @Patch('recommendations/:id')
  @WorkspaceRole('owner', 'nutritionist')
  async setStatus(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RecStatusDto) {
    return { data: await this.ai.setRecommendationStatus(u, id, dto.status) };
  }

  @Get('governance')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'AI-proposed actions awaiting human approval.' })
  async governance(@CurrentUser() u: AuthUser, @Query('status') status?: string) {
    return { data: await this.ai.listGovernance(u, status) };
  }

  @Post('governance/:id/review')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(200)
  @Audit({ action: 'ai.governance.review', resourceType: 'ai_governance_action', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Approve (and execute) or reject an AI-proposed action.' })
  async review(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) {
    return { data: await this.ai.reviewGovernance(u, id, dto.decision, dto.note) };
  }

  @Get('analytics')
  @WorkspaceRole('owner', 'nutritionist')
  async analytics(@CurrentUser() u: AuthUser) {
    return { data: await this.ai.analytics(u) };
  }
}
