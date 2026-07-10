import { Module } from '@nestjs/common';
import { PushService } from './push.service';

/**
 * Standalone Web-Push transport. Extracted from ClientsModule so any feature
 * module (notifications, clients, automation, enterprise-ai…) can inject
 * PushService without pulling in ClientsModule — and so NotificationsModule can
 * depend on push without a circular import back through ClientsModule.
 */
@Module({
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
