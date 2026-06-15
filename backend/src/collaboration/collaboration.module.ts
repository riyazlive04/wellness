import { Module } from '@nestjs/common';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { CollaborationService } from './collaboration.service';
import { CollaborationController } from './collaboration.controller';

/**
 * Module 9 — Communication & Collaboration Hub (team layer). Reuses
 * AssistantGeminiService for conversation summaries + smart replies.
 */
@Module({
  imports: [AiAssistantModule],
  controllers: [CollaborationController],
  providers: [CollaborationService],
})
export class CollaborationModule {}
