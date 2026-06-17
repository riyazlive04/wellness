import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { CalculatorService } from './calculator.service';
import { FoodMasterService } from './food-master.service';
import { HealthSpecService } from './health-spec.service';
import { NutritionController } from './nutrition.controller';
import { RulesService } from './rules.service';

/**
 * NutritionEngineModule — the deterministic nutrition calculation core.
 *
 * Exports CalculatorService + FoodMasterService so other modules (Plate
 * Vision, Voice AI, Meal logging, Recipe engine) can inject them in Phase 2+
 * to route their AI outputs through the engine instead of generating
 * nutrient values directly.
 *
 * NEVER let those modules import this controller's services via HTTP —
 * always use the injected service classes for in-process calls.
 */
@Module({
  controllers: [NutritionController],
  providers: [FoodMasterService, RulesService, AuditService, CalculatorService, HealthSpecService],
  exports: [FoodMasterService, CalculatorService, AuditService, HealthSpecService],

})
export class NutritionEngineModule {}