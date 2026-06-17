import { Body, Controller, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { AuditService } from './audit.service';
import { CalculatorService } from './calculator.service';
import { FoodMasterService } from './food-master.service';
import { HealthSpecService } from './health-spec.service';
import type { CalculateInput, CookingMethodCode, FoodCategory } from './nutrition.types';

class CalculateDto implements Partial<CalculateInput> {
  @IsOptional() @IsString() food_id?: string;
  @IsOptional() @IsString() @MaxLength(150) food_query?: string;

  @IsNumber() @Min(0.01) @Max(10_000)
  quantity_g!: number;

  @IsOptional()
  @IsIn([
    'raw', 'boiled', 'steamed', 'grilled', 'roasted', 'baked',
    'sauteed', 'pan_fried', 'deep_fried', 'stir_fried', 'curried',
    'tandoor', 'pressure_cooked', 'microwaved', 'fermented',
  ])
  cooking_method?: CookingMethodCode;

  @IsOptional() @IsIn(['raw', 'as_consumed'])
  quantity_state?: 'raw' | 'as_consumed';

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  ai_confidence?: number;
}

/**
 * Public-facing nutrition API. Authenticated; no role gate (any signed-in
 * user can search/calculate). Audit reads filtered by RLS at the DB layer.
 *
 * Mounted at /api/v1/nutrition.
 */
@ApiTags('Nutrition Engine')
@ApiBearerAuth()
@Controller({ path: 'nutrition', version: '1' })
export class NutritionController {
  constructor(
    private readonly foodMaster: FoodMasterService,
    private readonly calculator: CalculatorService,
    private readonly audit: AuditService,
    private readonly healthSpec: HealthSpecService,
  ) {}

  @Get('foods/search')
  @ApiOperation({ summary: 'Search the food master DB. Top-5 by trigram similarity + alias match.' })
  async searchFoods(
    @Query('q') q: string,
    @Query('lang') lang?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? Number(limit) : 10;
    const results = await this.foodMaster.search(q ?? '', {
      language: lang ?? 'en',
      category,
      limit: Number.isFinite(n) ? n : 10,
    });
    return { data: results };
  }

  @Get('foods/resolve')
  @ApiOperation({ summary: 'Resolve a query to the single best food, or return an UnresolvedFood marker.' })
  async resolveFood(@Query('q') q: string, @Query('lang') lang?: string) {
    return { data: await this.foodMaster.resolve(q ?? '', lang ?? 'en') };
  }

  @Get('foods/:id')
  @ApiOperation({ summary: 'Full food record + per-100g nutrient panel + health profile.' })
  async getFood(@Param('id') id: string) {
    const food = await this.foodMaster.getById(id);
    const health = await this.healthSpec.fullSpec(
      { id: food.id, canonical_name: food.canonical_name },
      food.nutrients,
      food.category as FoodCategory,
    );
    return { data: { ...food, health } };
  }

  @Post('calculate')
  @ApiOperation({
    summary: 'Run the deterministic nutrition calculator. Returns a frozen result + audit_id.',
  })
  async calculate(@CurrentUser() user: AuthUser, @Body() body: CalculateDto) {
    if (!body.food_id && !body.food_query) {
      throw new ForbiddenException('Provide either food_id or food_query.');
    }
    return {
      data: await this.calculator.calculate(body as CalculateInput, {
        actor_user_id: user.id,
        workspace_id: user.workspaceId ?? undefined,
        target_type: 'food',
      }),
    };
  }

  @Get('audit/:id')
  @ApiOperation({ summary: 'Retrieve an audit record by id. RLS gates by workspace.' })
  async getAudit(@Param('id') id: string) {
    return { data: await this.audit.getById(id) };
  }
}