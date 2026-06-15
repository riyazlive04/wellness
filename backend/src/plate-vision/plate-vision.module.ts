import { Module } from '@nestjs/common';
import { NutritionEngineModule } from '../nutrition-engine/nutrition-engine.module';
import { PlateInsightService } from './plate-insight.service';
import { PlateVisionController } from './plate-vision.controller';
import { PlateVisionService } from './plate-vision.service';

/**
 * Plate Vision module — Meal History + AI Insights + Nutritionist Review.
 *
 * Builds on the recognition pipeline (AiVisionModule) and the deterministic
 * engine (NutritionEngineModule, which exports CalculatorService). Logging
 * re-runs the calculator server-side so persisted nutrition is always
 * engine-derived and auditable.
 */
@Module({
  imports: [NutritionEngineModule],
  controllers: [PlateVisionController],
  providers: [PlateVisionService, PlateInsightService],
  exports: [PlateVisionService],
})
export class PlateVisionModule {}
