import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MealPlanAiService } from './meal-plan-ai.service';
import { MealPlansController } from './meal-plans.controller';
import { MealPlansService } from './meal-plans.service';
import { MyMealPlanController } from './my-meal-plan.controller';

// UsageModule is @Global — MealPlanAiService injects UsageService without it.
@Module({
  imports: [NotificationsModule],
  controllers: [MealPlansController, MyMealPlanController],
  providers: [MealPlansService, MealPlanAiService],
  exports: [MealPlansService],
})
export class MealPlansModule {}
