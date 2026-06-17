import { Module } from '@nestjs/common';
import { CommunityService } from './community.service';
import { WorkspaceCommunityController } from './workspace-community.controller';

/**
 * CommunityModule — owner/workspace-facing community over the shared community
 * tables (workspace-scoped, owner authors as a user).
 */
@Module({
  controllers: [WorkspaceCommunityController],
  providers: [CommunityService],
  exports: [CommunityService],
})
export class CommunityModule {}