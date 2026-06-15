import { Module } from '@nestjs/common';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { ProgramsService } from './programs.service';
import { ProgramsController } from './programs.controller';
import { ProgramsClientController } from './programs-client.controller';

/**
 * Module 8 — Program Management Engine. Reuses AssistantGeminiService (from the
 * AI assistant module) for AI program recommendations.
 */
@Module({
  imports: [AiAssistantModule],
  controllers: [ProgramsController, ProgramsClientController],
  providers: [ProgramsService],
})
export class ProgramsModule {}
