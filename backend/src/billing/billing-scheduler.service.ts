import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingAutomationService } from './billing-automation.service';

/**
 * BillingSchedulerService — the cron that fires the billing automation jobs
 * (Module 3 — Automation Principles). Runs once daily; everything it triggers
 * is idempotent, so the exact fire time and missed runs are harmless.
 *
 * Render runs a single web instance, so a single in-process cron is sufficient.
 * If this ever scales horizontally, move the trigger to an external scheduler
 * hitting the admin `POST /admin/billing/automation/run` endpoint instead.
 */
@Injectable()
export class BillingSchedulerService {
  private readonly logger = new Logger(BillingSchedulerService.name);

  constructor(private readonly automation: BillingAutomationService) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, {
    name: 'billing-automation-daily',
    timeZone: 'Asia/Kolkata',
  })
  async daily(): Promise<void> {
    this.logger.log('Running daily billing automation…');
    try {
      await this.automation.runAll();
    } catch (err) {
      this.logger.error(`Daily billing automation failed: ${(err as Error).message}`);
    }
  }
}
