import { Module } from '@nestjs/common';
import { PushModule } from '../clients/push.module';
import { ClientNotificationsController, NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationPreferencesService } from './notification-preferences.service';

@Module({
  imports: [PushModule],
  controllers: [NotificationsController, ClientNotificationsController],
  providers: [NotificationsService, NotificationPreferencesService],
  exports: [NotificationsService, NotificationPreferencesService],
})
export class NotificationsModule {}
