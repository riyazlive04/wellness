import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MyRemindersController, RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  imports: [NotificationsModule],
  controllers: [RemindersController, MyRemindersController],
  providers: [RemindersService],
})
export class RemindersModule {}
