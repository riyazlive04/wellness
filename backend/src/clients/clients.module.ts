import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { WorkspaceRecipesModule } from '../workspace-recipes/workspace-recipes.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClientsService } from './clients.service';
import { InvitesController } from './invites.controller';
import { MeController } from './me.controller';
import { PushModule } from './push.module';
import { WorkspaceClientsController } from './workspace-clients.controller';
import { WorkspaceAppointmentsController } from './workspace-appointments.controller';
import { AssessmentFormsController } from './assessment-forms.controller';

@Module({
  imports: [TenancyModule, WorkspaceRecipesModule, PushModule, NotificationsModule],
  controllers: [WorkspaceClientsController, WorkspaceAppointmentsController, AssessmentFormsController, MeController, InvitesController],
  providers: [ClientsService],
  // Re-export PushModule so existing importers of ClientsModule keep getting PushService.
  exports: [ClientsService, PushModule],
})
export class ClientsModule {}