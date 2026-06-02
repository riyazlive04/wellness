import { Module } from '@nestjs/common';
import { AdminWorkspacesController } from './admin-workspaces.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminWorkspacesController],
  providers: [AdminService],
})
export class AdminModule {}
