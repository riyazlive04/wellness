import { Module } from '@nestjs/common';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

/** Module 10 — workspace Reports & Analytics Engine. Reuses AssistantGeminiService for AI insights. */
@Module({
  imports: [AiAssistantModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
