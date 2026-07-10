import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { EnterpriseAiService } from './enterprise-ai.service';
import { EnterpriseAiController } from './enterprise-ai.controller';
import { AiFeedbackController } from './ai-feedback.controller';

/**
 * Module 12 — Enterprise AI Ecosystem. Recommendation store + governance queue +
 * feedback + unified AI analytics. Recommendations are rule-based (no AI);
 * governed broadcasts dispatch through NotificationsService (bell + web push).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [EnterpriseAiController, AiFeedbackController],
  providers: [EnterpriseAiService],
})
export class EnterpriseAiModule {}
