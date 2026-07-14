import { Module } from '@nestjs/common';
import { NetworkService } from './network.service';
import { NetworkController } from './network.controller';

/**
 * NetworkModule — the global, cross-practice Nutritionist Network feed
 * (staff-only, not workspace-scoped). Distinct from the per-workspace
 * CommunityModule.
 */
@Module({
  controllers: [NetworkController],
  providers: [NetworkService],
})
export class NetworkModule {}
