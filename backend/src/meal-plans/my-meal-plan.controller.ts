import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { MealPlansService } from './meal-plans.service';

/**
 * Client side of the meal planner. Resolves everything from the caller's own
 * user id — a client can never name a plan, a client id, or a workspace — and
 * the service only ever returns published plans.
 */
@ApiTags('Meal plans')
@ApiBearerAuth()
@Controller({ path: 'me/meal-plan', version: '1' })
export class MyMealPlanController {
  constructor(private readonly plans: MealPlansService) {}

  @Get()
  @ApiOperation({ summary: 'The caller\'s current published plan (this week, else latest). Null if none.' })
  async current(@CurrentUser() user: AuthUser) {
    return { data: await this.plans.myCurrentPlan(user.id) };
  }

  @Get('history')
  @ApiOperation({ summary: 'The caller\'s published plans, newest first.' })
  async history(@CurrentUser() user: AuthUser) {
    return { data: await this.plans.myPlans(user.id) };
  }
}
