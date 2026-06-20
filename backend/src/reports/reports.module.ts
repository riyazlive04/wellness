import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

/** Reports — owner "PDFs, summaries & audits". Reuses AnalyticsService for the
 *  workspace-digest numbers; PDFs themselves are rendered client-side. */
@Module({
  imports: [AnalyticsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
