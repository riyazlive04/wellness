import { Module } from '@nestjs/common';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';

/**
 * Knowledge base: document ingestion, full-text retrieval, and grounded answers
 * (see KnowledgeService). Passages live in the same Postgres as everything
 * else, so tenant scoping reuses the workspace ids already in the schema.
 * PrismaModule is @Global, so no database import is needed here.
 */
@Module({
  imports: [AiAssistantModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
