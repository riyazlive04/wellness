import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { ClientsModule } from '../clients/clients.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { AutomationController } from './automation.controller';
import { AutomationExecutor } from './automation-executor.service';
import { AutomationScheduler } from './automation-scheduler.service';
import { AutomationService } from './automation.service';

/**
 * AutomationModule — rule storage + execution pipeline.
 *
 * The executor subscribes to ACTIVITY_RECORDED_EVENT (registered by
 * ActivityLogModule's EventEmitter). When a matching rule fires, the
 * executor writes a 'notification' activity_logs row OR POSTs to an external
 * webhook, and records the run in automation_runs.
 *
 * Depends on ActivityLogModule for the EventBus — importing it ensures the
 * EventEmitterModule (forRoot'd inside ActivityLogModule) is available here.
 */
@Module({
  imports: [ActivityLogModule, ClientsModule, NotificationsModule, AiAssistantModule],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationExecutor, AutomationScheduler],
  exports: [AutomationService],
})
export class AutomationModule {}
