import { Module } from '@nestjs/common';
import { AdminBillingController } from './admin-billing.controller';
import { BillingService } from './billing.service';
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
  providers: [BillingService, RazorpayService, RazorpayWebhookService],
  exports: [BillingService, RazorpayService],
})
export class BillingModule {}