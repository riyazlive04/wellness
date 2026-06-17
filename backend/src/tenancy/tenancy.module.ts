import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LimitsService } from './limits.service';
import { PermissionsService } from './permissions.service';
import { TeamService } from './team.service';
import { TeamInvitesController } from './team-invites.controller';
import { TenancyController } from './tenancy.controller';
import { WorkspaceSwitchController } from './workspace-switch.controller';
import { WorkspaceSwitchService } from './workspace-switch.service';

/**
 * TenancyModule — Module 2 enforcement layer.
 *
 * Exports LimitsService so quota-consuming modules (clients, ai-vision,
 * ai-voice) can pre-flight their operations against the workspace's plan.
 */
@Module({
  imports: [AuthModule],
  controllers: [TenancyController, TeamInvitesController, WorkspaceSwitchController],
  providers: [LimitsService, TeamService, PermissionsService, WorkspaceSwitchService],
  exports: [LimitsService, TeamService, PermissionsService, WorkspaceSwitchService],
})
export class TenancyModule {}
