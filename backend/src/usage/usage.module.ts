import { Global, Module } from '@nestjs/common';
import { AdminUsageController } from './admin-usage.controller';
import { UsageService } from './usage.service';

/**
 * @Global so ai-voice / ai-vision / future ai-chat can inject UsageService
 * without importing UsageModule everywhere.
 */
@Global()
@Module({
  controllers: [AdminUsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}