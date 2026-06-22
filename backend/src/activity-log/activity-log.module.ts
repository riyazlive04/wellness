import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ClientsModule } from '../clients/clients.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogInterceptor } from './activity-log.interceptor';
import { ActivityLogService } from './activity-log.service';
import { AnalyticsHandler } from './analytics.handler';
import { NotificationHandler } from './notification.handler';

/**
 * ActivityLogModule — the Application Flow's instrumentation backbone.
 *
 * Provides:
 *   - The activity_logs write service
 *   - The global interceptor that records every mutation
 *   - Two event handlers (Analytics + Notification) listening on
 *     ACTIVITY_RECORDED_EVENT to fan-out work asynchronously
 *
 * Registers EventEmitterModule globally so any other module can publish
 * domain events later (Automation engine, real-time gateway, etc).
 */
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      ignoreErrors: true,
    }),
    ClientsModule,
    NotificationsModule,
  ],
  controllers: [ActivityLogController],
  providers: [
    ActivityLogService,
    AnalyticsHandler,
    NotificationHandler,
    { provide: APP_INTERCEPTOR, useClass: ActivityLogInterceptor },
  ],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
