import {
  Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { MealPlanAiService } from './meal-plan-ai.service';
import { MealPlansService } from './meal-plans.service';
import { MEAL_SLOTS, MealSlot } from './meal-plans.types';
import {
  AddCardDto, CreatePlanDto, DuplicatePlanDto, GeneratePlanDto, SetPlanStatusDto, UpdateCardDto,
} from './dto/meal-plan.dto';

/**
 * Owner/nutritionist side of the weekly meal planner. Every route resolves the
 * plan through the caller's workspace, so a plan id alone is never enough.
 */
@ApiTags('Meal plans')
@ApiBearerAuth()
@Controller({ path: 'workspaces/me/meal-plans', version: '1' })
@WorkspaceRole('owner', 'nutritionist')
export class MealPlansController {
  constructor(
    private readonly plans: MealPlansService,
    private readonly ai: MealPlanAiService,
  ) {}

  @Get('slots')
  @ApiOperation({ summary: 'The meal slots a plan can use (mirrors the meal_type enum).' })
  slots() {
    return { data: { slots: MEAL_SLOTS, aiEnabled: this.ai.isConfigured } };
  }

  @Get()
  @ApiOperation({ summary: 'List a client\'s weekly plans (newest first).' })
  async list(@CurrentUser() user: AuthUser, @Query('clientId') clientId: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    if (!clientId) throw new ForbiddenException('clientId is required');
    return { data: await this.plans.listForClient(user.workspaceId, clientId) };
  }

  @Get('saved-meals')
  @ApiOperation({ summary: 'The workspace\'s reusable free-typed meals ("My foods"), newest first.' })
  async savedMeals(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.plans.savedMeals(user.workspaceId, search) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'One plan with all its meal cards.' })
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.plans.get(user.workspaceId, id) };
  }

  @Post()
  @RequirePermission('clients.write')
  @HttpCode(201)
  @ApiOperation({ summary: 'Start a new (draft) week for a client.' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreatePlanDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return {
      data: await this.plans.create(user.workspaceId, dto.clientId, dto.startDate, dto.weekNumber),
    };
  }

  @Patch(':id/status')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Publish the plan to the client, or pull it back to draft.' })
  async setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetPlanStatusDto,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.plans.setStatus(user.workspaceId, id, dto.status) };
  }

  @Post(':id/duplicate')
  @RequirePermission('clients.write')
  @HttpCode(201)
  @ApiOperation({ summary: 'Copy this week onto a new start date ("repeat last week").' })
  async duplicate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DuplicatePlanDto,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.plans.duplicate(user.workspaceId, id, dto.startDate) };
  }

  @Delete(':id')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Delete a plan and its meals.' })
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.plans.remove(user.workspaceId, id) };
  }

  // ── Cards ─────────────────────────────────────────────────────────

  @Post(':id/cards')
  @RequirePermission('clients.write')
  @HttpCode(201)
  @ApiOperation({ summary: 'Add a meal to a day/slot (from the library or free text).' })
  async addCard(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddCardDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.plans.addCard(user.workspaceId, id, dto, user.id) };
  }

  @Patch(':id/cards/:cardId')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Edit or move a meal.' })
  async updateCard(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('cardId') cardId: string,
    @Body() dto: UpdateCardDto,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.plans.updateCard(user.workspaceId, id, cardId, dto) };
  }

  @Delete(':id/cards/:cardId')
  @RequirePermission('clients.write')
  @ApiOperation({ summary: 'Remove a meal from the plan.' })
  async removeCard(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('cardId') cardId: string,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.plans.removeCard(user.workspaceId, id, cardId) };
  }

  // ── AI ────────────────────────────────────────────────────────────

  @Post(':id/generate')
  @RequirePermission('clients.write')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Draft a week with AI from the client\'s profile. Always lands as DRAFT cards for review.',
  })
  async generate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: GeneratePlanDto,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    const plan = await this.plans.get(user.workspaceId, id);

    const cards = await this.ai.generate({
      workspaceId: user.workspaceId,
      clientId: plan.client_id,
      slots: dto.slots as MealSlot[],
      notes: dto.notes,
    });

    if (dto.replace && plan.cards?.length) {
      for (const c of plan.cards) {
        await this.plans.removeCard(user.workspaceId, id, c.id);
      }
    }

    for (const c of cards) {
      await this.plans.addCard(user.workspaceId, id, {
        dayNumber: c.day_number,
        mealType: c.meal_type,
        mealName: c.meal_name,
        description: c.description,
        kcal: c.kcal,
        ingredients: c.ingredients,
      });
    }

    return { data: await this.plans.get(user.workspaceId, id) };
  }
}
