import { Module } from '@nestjs/common';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { ClientsModule } from '../clients/clients.module';
import { EnterpriseAiService } from './enterprise-ai.service';
import { EnterpriseAiController } from './enterprise-ai.controller';
import { AiFeedbackController } from './ai-feedback.controller';

/**
 * Module 12 — Enterprise AI Ecosystem. Recommendation store + governance queue +
 * feedback + unified AI analytics. Reuses AssistantGeminiService (recommendations)
 * and PushService (governed broadcast execution).
 */
@Module({
  imports: [AiAssistantModule, ClientsModule],
  controllers: [EnterpriseAiController, AiFeedbackController],
  providers: [EnterpriseAiService],
})
export class EnterpriseAiModule {}
