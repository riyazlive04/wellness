import { Module } from '@nestjs/common';

import { MeUiController } from './me-ui.controller';
import { SduiService } from './sdui.service';
import { WorkspaceUiController } from './workspace-ui.controller';

/**
 * Server-driven UI for the client mobile app.
 *
 * Two audiences, one service: devices read a resolved, plan-pruned bundle from
 * MeUiController, and the web editor authors it through WorkspaceUiController.
 * PrismaService is global; nothing else is needed here.
 */
@Module({
  controllers: [MeUiController, WorkspaceUiController],
  providers: [SduiService],
  exports: [SduiService],
})
export class SduiModule {}
