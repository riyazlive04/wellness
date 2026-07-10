import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { AuditService } from './audit.service';
import { CalculatorService } from './calculator.service';
import { FoodMasterService } from './food-master.service';
import { HealthSpecService } from './health-spec.service';
import { IngredientsService } from './ingredients.service';
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

const FOOD_CATEGORIES = [
  'cereals', 'pulses', 'leafy_vegetables', 'roots_tubers', 'other_vegetables',
  'fruits', 'milk_products', 'meat', 'poultry', 'fish_seafood', 'eggs',
  'fats_oils', 'sugars', 'beverages', 'condiments_spices', 'nuts_seeds',
  'cooked_dishes', 'baked_goods', 'fast_food', 'misc',
];

/** A practice adding its own food — per-100g macros, validated & capped. */
class CreateCustomFoodDto {
  @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @IsIn(FOOD_CATEGORIES) category!: string;
  @IsNumber() @Min(0) @Max(1000) energy_kcal!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) protein_g?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) carbohydrate_g?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) fat_g?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) fiber_g?: number;
  @IsOptional() @IsString() @MaxLength(200) source_citation?: string;
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
    private readonly ingredients: IngredientsService,
  ) {}

  @Get('ingredients')
  @ApiOperation({ summary: 'Typical ingredients used to make a named dish (AI-generated, cached).' })
  async getIngredients(@Query('name') name?: string, @Query('category') category?: string) {
    return { data: await this.ingredients.forFood((name ?? '').slice(0, 150), category) };
  }

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

  @Get('custom-foods')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'List the workspace\'s own custom foods.' })
  async listCustomFoods(@CurrentUser() user: AuthUser) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.foodMaster.listCustomFoods(user.workspaceId) };
  }

  @Post('custom-foods')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Add a custom food to the workspace library.' })
  async createCustomFood(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomFoodDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.foodMaster.createCustomFood(user.workspaceId, user.id, dto) };
  }

  @Delete('custom-foods/:id')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Remove a workspace custom food.' })
  async deleteCustomFood(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.foodMaster.deleteCustomFood(user.workspaceId, id) };
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