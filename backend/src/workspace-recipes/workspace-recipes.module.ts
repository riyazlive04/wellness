import { Module } from '@nestjs/common';
import { NutritionEngineModule } from '../nutrition-engine/nutrition-engine.module';
import { WorkspaceRecipesController } from './workspace-recipes.controller';
import { WorkspaceRecipesService } from './workspace-recipes.service';

/**
 * WorkspaceRecipesModule — nutritionist-authored recipes that sum nutrition
 * live from the canonical food library via CalculatorService.
 */
@Module({
  imports: [NutritionEngineModule],
  controllers: [WorkspaceRecipesController],
  providers: [WorkspaceRecipesService],
  exports: [WorkspaceRecipesService],
})
export class WorkspaceRecipesModule {}
