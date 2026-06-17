import { Module } from '@nestjs/common';
import {
  IntegrationsController,
  WorkspaceIntegrationsController,
} from './integrations.controller';

@Module({
  controllers: [IntegrationsController, WorkspaceIntegrationsController],
})
export class IntegrationsModule {}