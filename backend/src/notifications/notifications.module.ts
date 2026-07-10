import { Module } from '@nestjs/common';
import { PushModule } from '../clients/push.module';
import { ClientNotificationsController, NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [PushModule],
  controllers: [NotificationsController, ClientNotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
