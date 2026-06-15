import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { RealtimeAuthService } from './realtime-auth.service';
import { RealtimeGateway } from './realtime.gateway';

/**
 * RealtimeModule — WebSocket gateway for live activity streaming.
 *
 * Imports ActivityLogModule so the EventEmitterModule is in scope (it's
 * forRoot'd there). Subscribes via @OnEvent in the gateway.
 */
@Module({
  imports: [ActivityLogModule],
  providers: [RealtimeAuthService, RealtimeGateway],
})
export class RealtimeModule {}
