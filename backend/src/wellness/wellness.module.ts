import { Module } from '@nestjs/common';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { WellnessController } from './wellness.controller';
import { WellnessService } from './wellness.service';

/**
 * Module 7 — Client Wellness Operating System. Goals, habits (with streaks),
 * journal, and a unified timeline for the client portal. Reuses
 * AssistantGeminiService (from the AI assistant module) for journal reflections.
 */
@Module({
  imports: [AiAssistantModule],
  controllers: [WellnessController],
  providers: [WellnessService],
})
export class WellnessModule {}
