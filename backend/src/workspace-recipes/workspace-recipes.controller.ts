import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceRole } from '../auth/decorators/workspace-role.decorator';
import { RequireFeature } from '../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreateRecipeDto, UpdateRecipeDto } from './dto/recipe.dto';
import { WorkspaceRecipesService } from './workspace-recipes.service';

class BulkImportRecipesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  names!: string[];
}

class BulkPublishDto {
  /** true = publish drafts (default), false = unpublish all published. */
  @IsOptional() @IsBoolean() publish?: boolean;
  /** When true, only recipes that have ≥1 ingredient are affected. */
  @IsOptional() @IsBoolean() onlyWithIngredients?: boolean;
}

/**
 * Workspace-scoped recipe management.
 * Owner + nutritionist roles only — clients do not author recipes.
 * Plan-gated: Recipes is an Elite-only feature.
 */
@ApiTags('Workspace · Recipes')
@ApiBearerAuth()
@RequireFeature('recipes')
@Controller({ path: 'workspaces/me/recipes', version: '1' })
export class WorkspaceRecipesController {
  constructor(private readonly recipes: WorkspaceRecipesService) {}

  @Get()
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'List recipes in the caller\'s workspace.' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('includeDrafts') includeDrafts?: string,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return {
      data: await this.recipes.list(user.workspaceId, {
        search,
        includeDrafts: includeDrafts === 'true' || includeDrafts === '1',
      }),
    };
  }

  @Get(':id')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({
    summary: 'Get a single recipe with LIVE computed nutrition (sums per-ingredient panels).',
  })
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.recipes.getWithNutrition(user.workspaceId, id, user.id) };
  }

  @Post()
  @WorkspaceRole('owner', 'nutritionist')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a recipe + ingredient list in one shot.' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateRecipeDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return {
      data: await this.recipes.create(user.workspaceId, user.id, dto),
    };
  }

  @Post('bulk-import')
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('recipes.write')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Bulk-create recipes from a list of dish names as empty drafts (replaces same-name recipes).',
  })
  async bulkImport(@CurrentUser() user: AuthUser, @Body() dto: BulkImportRecipesDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return {
      data: await this.recipes.bulkImportFromNames(user.workspaceId, user.id, dto.names),
    };
  }

  @Post('bulk-publish')
  @WorkspaceRole('owner', 'nutritionist')
  @RequirePermission('recipes.write')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publish all draft recipes (or unpublish all) in the workspace in one action.' })
  async bulkPublish(@CurrentUser() user: AuthUser, @Body() dto: BulkPublishDto) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return {
      data: await this.recipes.bulkPublish(user.workspaceId, {
        publish: dto.publish ?? true,
        onlyWithIngredients: dto.onlyWithIngredients ?? false,
      }),
    };
  }

  @Patch(':id')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({
    summary:
      'Update header and / or replace the ingredient list. If `ingredients` is provided, it REPLACES the existing rows.',
  })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRecipeDto,
  ) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.recipes.update(user.workspaceId, id, user.id, dto) };
  }

  @Delete(':id')
  @WorkspaceRole('owner', 'nutritionist')
  @ApiOperation({ summary: 'Delete a recipe + its ingredient rows (cascade).' })
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace');
    return { data: await this.recipes.remove(user.workspaceId, id) };
  }
}
