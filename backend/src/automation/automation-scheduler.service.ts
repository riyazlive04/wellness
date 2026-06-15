import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AutomationExecutor } from './automation-executor.service';

/**
 * AutomationScheduler — fires schedule-triggered automation rules (Module 11
 * Scheduling Engine). Rules whose trigger_event is 'schedule.daily' or
 * 'schedule.weekly' run on these crons (no entity context), letting users build
 * recurring staff reminders / webhooks without writing code.
 *
 * Single in-process cron is sufficient on Render's single web instance; if this
 * scales horizontally, move the trigger to an external scheduler hitting an
 * admin endpoint.
 */
@Injectable()
export class AutomationScheduler {
  private readonly logger = new Logger(AutomationScheduler.name);

  constructor(private readonly executor: AutomationExecutor) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM, { name: 'automation-daily', timeZone: 'Asia/Kolkata' })
  async daily(): Promise<void> {
    try { await this.executor.runScheduled('schedule.daily'); }
    catch (e) { this.logger.error(`Daily automation failed: ${(e as Error).message}`); }
  }

  // Mondays at 08:00 IST.
  @Cron('0 8 * * 1', { name: 'automation-weekly', timeZone: 'Asia/Kolkata' })
  async weekly(): Promise<void> {
    try { await this.executor.runScheduled('schedule.weekly'); }
    catch (e) { this.logger.error(`Weekly automation failed: ${(e as Error).message}`); }
  }
}
