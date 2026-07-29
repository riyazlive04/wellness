import {
  Body, Controller, Delete, ForbiddenException, Get, HttpCode,
  Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { RequireFeature } from '../auth/decorators/require-feature.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { AutomationService } from './automation.service';
import {
  CreateRuleDto, UpdateRuleDto,
} from './dto/rule.dto';
import type { AutomationAction, AutomationCondition } from './automation.types';

@ApiTags('Workspace · Automation')
@ApiBearerAuth()
@RequireFeature('automation') // Growth+ (grandfathered legacy plans keep it)
@Controller({ path: 'workspaces/me/automation', version: '1' })
export class AutomationController {
  constructor(private readonly automations: AutomationService) {}

  // ── Rules ─────────────────────────────────────────────────────────

  @Get('rules')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'List automation rules in the caller\'s workspace.' })
  async list(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.automations.list(user.workspaceId) };
  }

  @Get('rules/:id')
  @WorkspaceRole('owner', 'nutritionist')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.automations.get(user.workspaceId, id) };
  }

  @Post('rules')
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(201)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateRuleDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return {
      data: await this.automations.create(user.workspaceId, user.id, {
        name: dto.name,
        description: dto.description,
        is_enabled: dto.is_enabled,
        trigger_event: dto.trigger_event,
        conditions: (dto.conditions ?? []) as AutomationCondition[],
        actions: dto.actions as unknown as AutomationAction[],
      }),
    };
  }

  @Patch('rules/:id')
  @WorkspaceRole('owner', 'nutritionist')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRuleDto,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return {
      data: await this.automations.update(user.workspaceId, id, {
        name: dto.name,
        description: dto.description,
        is_enabled: dto.is_enabled,
        trigger_event: dto.trigger_event,
        conditions: dto.conditions as AutomationCondition[] | undefined,
        actions: dto.actions as unknown as AutomationAction[] | undefined,
      }),
    };
  }

  @Delete('rules/:id')
  @WorkspaceRole('owner', 'nutritionist')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.automations.remove(user.workspaceId, id) };
  }

  // ── Runs ──────────────────────────────────────────────────────────

  @Get('runs')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Recent automation runs across this workspace.' })
  async listRuns(
    @CurrentUser() user: AuthUser,
    @Query('ruleId') ruleId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return {
      data: await this.automations.listRuns(user.workspaceId, {
        ruleId,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      }),
    };
  }

  @Get('analytics')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Automation analytics: rule counts, fires, success rate.' })
  async analytics(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.automations.analytics(user.workspaceId) };
  }
}
