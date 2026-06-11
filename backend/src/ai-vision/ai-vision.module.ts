import { Module } from '@nestjs/common';
import { NutritionEngineModule } from '../nutrition-engine/nutrition-engine.module';
import { AiVisionController } from './ai-vision.controller';
import { AiVisionService } from './ai-vision.service';

/**
 * Plate Vision module.
 *
 * Depends on NutritionEngineModule (exports FoodMasterService + CalculatorService)
 * so AiVisionService can route Gemini's identifications through the deterministic
 * nutrition calculator instead of asking the AI to invent macro values.
 */
@Module({
  imports: [NutritionEngineModule],
  controllers: [AiVisionController],
  providers: [AiVisionService],
})
export class AiVisionModule {}
