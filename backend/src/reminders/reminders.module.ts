import { Module } from '@nestjs/common';
import { MealPlansModule } from '../meal-plans/meal-plans.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MyRemindersController, RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  imports: [NotificationsModule, MealPlansModule],
  controllers: [RemindersController, MyRemindersController],
  providers: [RemindersService],
})
export class RemindersModule {}
