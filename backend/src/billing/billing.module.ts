import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminBillingController } from './admin-billing.controller';
import { BillingService } from './billing.service';
import { BillingNotificationService } from './billing-notification.service';
import { BillingAutomationService } from './billing-automation.service';
import { BillingSchedulerService } from './billing-scheduler.service';
import { InvoiceService } from './invoice.service';
import { AdminTrialController } from './admin-trial.controller';
import { TrialService } from './trial.service';
import { RazorpayService } from './razorpay.service';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { RazorpayWebhookService } from './razorpay-webhook.service';
import { PublicPlansController } from './public-plans.controller';
import { WorkspaceBillingController } from './workspace-billing.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [
    AdminBillingController,
    RazorpayWebhookController,
    WorkspaceBillingController,
    PublicPlansController,
    AdminTrialController,
  ],
  providers: [
    TrialService,
    BillingService,
    RazorpayService,
    RazorpayWebhookService,
    InvoiceService,
    BillingNotificationService,
    BillingAutomationService,
    BillingSchedulerService,
  ],
  exports: [
    TrialService,
    BillingService,
    RazorpayService,
    InvoiceService,
    BillingNotificationService,
    BillingAutomationService,
  ],
})
export class BillingModule {}