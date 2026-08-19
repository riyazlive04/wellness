import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AiVisionController } from './ai-vision.controller';
import { AiVisionService } from './ai-vision.service';

/**
 * Plate Vision — dish-level recognition.
 *
 * No longer imports NutritionEngineModule: the plate path now takes its
 * nutrition from the model rather than routing identifications through
 * CalculatorService. The engine still backs voice, barcode, meal-plans and
 * manual entry through their own modules.
 */
@Module({
  imports: [TenancyModule],
  controllers: [AiVisionController],
  providers: [AiVisionService],
})
export class AiVisionModule {}
