import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';

/**
 * Knowledge base: document ingestion, vector retrieval, and grounded answers.
 *
 * Vectors live in the same Postgres as everything else (pgvector), so tenant
 * scoping reuses the workspace ids already in the schema rather than a second
 * store with its own separate notion of who may read what. PrismaModule is
 * @Global, so no database import is needed here.
 */
@Module({
  controllers: [KnowledgeController],
  providers: [KnowledgeService, EmbeddingsService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
