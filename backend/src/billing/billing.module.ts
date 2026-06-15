import { Module } from '@nestjs/common';
import { AdminBillingController } from './admin-billing.controller';
import { BillingService } from './billing.service';
import { BillingNotificationService } from './billing-notification.service';
import { BillingAutomationService } from './billing-automation.service';
import { BillingSchedulerService } from './billing-scheduler.service';
import { InvoiceService } from './invoice.service';
import { RazorpayService } from './razorpay.service';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { RazorpayWebhookService } from './razorpay-webhook.service';
import { WorkspaceBillingController } from './workspace-billing.controller';

@Module({
  controllers: [
    AdminBillingController,
    RazorpayWebhookController,
    WorkspaceBillingController,
  ],
  providers: [
    BillingService,
    RazorpayService,
    RazorpayWebhookService,
    InvoiceService,
    BillingNotificationService,
    BillingAutomationService,
    BillingSchedulerService,
  ],
  exports: [
    BillingService,
    RazorpayService,
    InvoiceService,
    BillingNotificationService,
    BillingAutomationService,
  ],
})
export class BillingModule {}