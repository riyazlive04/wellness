import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { InvitesController } from './invites.controller';
import { MeController } from './me.controller';
import { WorkspaceClientsController } from './workspace-clients.controller';

@Module({
  controllers: [WorkspaceClientsController, MeController, InvitesController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}