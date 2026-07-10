import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { EnterpriseAiService } from './enterprise-ai.service';
import { EnterpriseAiController } from './enterprise-ai.controller';
import { AiFeedbackController } from './ai-feedback.controller';

/**
 * Module 12 — Enterprise AI Ecosystem. Recommendation store + governance queue +
 * feedback + unified AI analytics. Recommendations are rule-based (no AI);
 * PushService (from ClientsModule) executes governed broadcasts.
 */
@Module({
  imports: [ClientsModule],
  controllers: [EnterpriseAiController, AiFeedbackController],
  providers: [EnterpriseAiService],
})
export class EnterpriseAiModule {}
