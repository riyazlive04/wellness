import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { StoreClientController } from './store-client.controller';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';

/**
 * Product store. BillingModule is imported for RazorpayService, so checkout
 * reuses the same gateway as subscriptions.
 *
 * Fulfilment deliberately does NOT live here: it's a private method on
 * RazorpayWebhookService (next to grantTopupCredits), which keeps the
 * dependency one-way — Store depends on Billing, never the reverse.
 */
@Module({
  imports: [BillingModule],
  controllers: [StoreController, StoreClientController],
  providers: [StoreService],
})
export class StoreModule {}
