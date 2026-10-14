import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { BillingModule } from '../billing/billing.module';
import { AdminOverviewController } from './admin-overview.controller';
import { AdminOverviewService } from './admin-overview.service';

// UsageModule is @Global, so UsageService is available without importing it.
@Module({
  imports: [AdminModule, BillingModule],
  controllers: [AdminOverviewController],
  providers: [AdminOverviewService],
})
export class AdminOverviewModule {}
