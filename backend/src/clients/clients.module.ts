import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ClientsService } from './clients.service';
import { InvitesController } from './invites.controller';
import { MeController } from './me.controller';
import { PushService } from './push.service';
import { WorkspaceClientsController } from './workspace-clients.controller';
import { WorkspaceAppointmentsController } from './workspace-appointments.controller';
import { AssessmentFormsController } from './assessment-forms.controller';

@Module({
  imports: [TenancyModule],
  controllers: [WorkspaceClientsController, WorkspaceAppointmentsController, AssessmentFormsController, MeController, InvitesController],
  providers: [ClientsService, PushService],
  exports: [ClientsService, PushService],
})
export class ClientsModule {}