import { Module } from '@nestjs/common';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';

/**
 * Per-workspace notification channel connections (email now, WhatsApp next).
 * MailService is @Global; ConnectionsService is exported so the notifications
 * dispatcher can resolve a workspace's own sender.
 */
@Module({
  controllers: [ConnectionsController],
  providers: [ConnectionsService],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
