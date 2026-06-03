import { Module } from '@nestjs/common';
import { AdminBillingController } from './admin-billing.controller';
import { BillingService } from './billing.service';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { RazorpayWebhookService } from './razorpay-webhook.service';

@Module({
  controllers: [AdminBillingController, RazorpayWebhookController],
  providers: [BillingService, RazorpayWebhookService],
  exports: [BillingService],
})
export class BillingModule {}