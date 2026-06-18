import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ClientsService } from './clients.service';
import { InvitesController } from './invites.controller';
import { MeController } from './me.controller';
import { PushService } from './push.service';
import { WorkspaceClientsController } from './workspace-clients.controller';
import { WorkspaceAppointmentsController } from './workspace-appointments.controller';

@Module({
  imports: [TenancyModule],
  controllers: [WorkspaceClientsController, WorkspaceAppointmentsController, MeController, InvitesController],
  providers: [ClientsService, PushService],
  exports: [ClientsService, PushService],
})
export class ClientsModule {}