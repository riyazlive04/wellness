import { Module } from '@nestjs/common';
import { FcmService } from './fcm.service';
import { PushController } from './push.controller';
import { PushService } from './push.service';

/**
 * Standalone Web-Push transport. Extracted from ClientsModule so any feature
 * module (notifications, clients, automation, enterprise-ai…) can inject
 * PushService without pulling in ClientsModule — and so NotificationsModule can
 * depend on push without a circular import back through ClientsModule.
 */
@Module({
  controllers: [PushController],
  providers: [PushService, FcmService],
  exports: [PushService, FcmService],
})
export class PushModule {}
