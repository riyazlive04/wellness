import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AssistantGeminiService } from './assistant-gemini.service';
import { AssistantContextService } from './assistant-context.service';
import { AssistantMemoryService } from './assistant-memory.service';
import { AssistantBriefService } from './assistant-brief.service';
import { AssistantActionService } from './assistant-action.service';
import { AssistantToolsService } from './assistant-tools.service';
import { ConversationService } from './conversation.service';

/**
 * Module 6 — AI Personal Assistant Platform. One module backs all three
 * role-scoped assistants (executive / clinical / wellness); the assistant type
 * is resolved per request from the caller's identity.
 *
 * Reuses: UsageService (global) for AI usage recording, the @Audit interceptor
 * (global) for audit logging, and BillingAutomationService (from BillingModule)
 * for the executive "run billing automation" action.
 */
@Module({
  imports: [BillingModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    AssistantGeminiService,
    AssistantContextService,
    AssistantMemoryService,
    AssistantBriefService,
    AssistantActionService,
    AssistantToolsService,
    ConversationService,
  ],
  exports: [AssistantGeminiService],
})
export class AiAssistantModule {}
