import { Module } from '@nestjs/common';
import { NetworkService } from './network.service';
import { NetworkController } from './network.controller';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * NetworkModule — the global, cross-practice Nutritionist Network feed
 * (staff-only, not workspace-scoped). Distinct from the per-workspace
 * CommunityModule.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [NetworkController],
  providers: [NetworkService],
})
export class NetworkModule {}
