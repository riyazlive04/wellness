import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MealPlanAiService } from './meal-plan-ai.service';
import { MealPlansController } from './meal-plans.controller';
import { MealPlansService } from './meal-plans.service';
import { MyMealPlanController } from './my-meal-plan.controller';
import { MealSlotsService } from './meal-slots.service';
import { NutrientColumnsService } from './nutrient-columns.service';

// UsageModule is @Global — MealPlanAiService injects UsageService without it.
@Module({
  imports: [NotificationsModule],
  controllers: [MealPlansController, MyMealPlanController],
  providers: [MealPlansService, MealPlanAiService, MealSlotsService, NutrientColumnsService],
  exports: [MealPlansService, MealSlotsService],
})
export class MealPlansModule {}
