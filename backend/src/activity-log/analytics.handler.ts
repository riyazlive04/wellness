import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import {
  ACTIVITY_RECORDED_EVENT,
  type ActivityRecordedEvent,
} from './activity-log.types';

/**
 * AnalyticsHandler — Application Flow "Analytics Update" stage.
 *
 * Subscribes to ActivityRecordedEvent and bumps day-bucketed counters in
 * workspace_metrics. Three metrics per event:
 *   1. mutations.total
 *   2. mutations.{entity_type}.{action}    e.g. mutations.recipe.create
 *   3. role.{actor_role}                   e.g. role.nutritionist
 *
 * Workspace-less events (super admin platform actions) are skipped — the
 * workspace_metrics table is workspace-scoped by design.
 *
 * Errors are swallowed and logged; analytics must never affect the user path.
 */
@Injectable()
export class AnalyticsHandler {
  private readonly logger = new Logger(AnalyticsHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(ACTIVITY_RECORDED_EVENT, { async: true })
  async handle(event: ActivityRecordedEvent): Promise<void> {
    if (!event.workspace_id) return;
    if (event.status_code >= 400) return;

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const metrics: string[] = ['mutations.total', `role.${event.actor_role}`];
    if (event.entity_type) {
      metrics.push(`mutations.${event.entity_type}.${event.action}`);
    }

    try {
      // ON CONFLICT upsert via raw SQL — cleaner than Prisma's nested upsert
      // for a simple counter. One round-trip per metric.
      for (const metric of metrics) {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO public.workspace_metrics (workspace_id, bucket_date, metric, value, updated_at)
           VALUES ($1::uuid, $2::date, $3, 1, now())
           ON CONFLICT (workspace_id, bucket_date, metric)
           DO UPDATE SET value = workspace_metrics.value + 1,
                         updated_at = now()`,
          event.workspace_id,
          today,
          metric,
        );
      }
    } catch (err) {
      this.logger.warn(`AnalyticsHandler failed: ${(err as Error).message}`);
    }
  }
}
