import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { PrismaService } from '../database/prisma.service';
import { EmbeddingsService } from './embeddings.service';
import { chunkDocument } from './chunker';

/**
 * Knowledge base — ingestion, retrieval, and grounded answers.
 *
 * The governing rule: the assistant answers ONLY from retrieved passages, and
 * says so when it has nothing. In a product used by clinicians, a confident
 * invented answer is worse than no answer, because it is indistinguishable
 * from a real one at the point it matters.
 */

export type KbScope = 'platform' | 'workspace';

export interface KbDocument {
  id: string;
  scope: KbScope;
  workspace_id: string | null;
  title: string;
  source_name: string | null;
  status: string;
  chunk_count: number;
  error_message: string | null;
  created_at: string;
}

export interface KbCitation {
  document_id: string;
  title: string;
  heading: string | null;
  chunk_index: number;
  similarity: number;
}

/** A retrieved passage: the citation fields plus the text itself. */
export interface KbHit extends KbCitation {
  content: string;
}

export interface KbAnswer {
  answer: string;
  citations: KbCitation[];
  /** 'grounded' = answered from sources; 'no_match' = nothing relevant found. */
  outcome: 'grounded' | 'no_match';
}

/** Below this cosine similarity a passage is not really about the question. */
const MIN_SIMILARITY = 0.45;
const TOP_K = 6;

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);
  private genAI: GoogleGenerativeAI | null = null;
  private readonly models = new Map<string, GenerativeModel>();
  private readonly primaryModel: string;
  private readonly fallbackModel: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    private readonly config: ConfigService,
  ) {
    // Same knobs the vision path uses, so both can be repointed together
    // during a model outage without a redeploy.
    this.primaryModel = this.config.get<string>('GEMINI_VISION_MODEL') || 'gemini-2.5-flash';
    const fb = this.config.get<string>('GEMINI_VISION_FALLBACK_MODEL');
    const resolved = fb === undefined ? 'gemini-2.5-flash-lite' : fb.trim();
    this.fallbackModel = resolved && resolved !== this.primaryModel ? resolved : null;

    const key = this.config.get<string>('GEMINI_API_KEY');
    if (key) this.genAI = new GoogleGenerativeAI(key);
  }

  private getModel(name: string): GenerativeModel {
    const cached = this.models.get(name);
    if (cached) return cached;
    const m = this.genAI!.getGenerativeModel({
      model: name,
      generationConfig: { temperature: 0.2 },
    });
    this.models.set(name, m);
    return m;
  }

  /**
   * Generate, falling back to a second model on an overloaded primary.
   *
   * Flash models genuinely return 503 under load for minutes at a time - it
   * happened to this very feature on its first live run. Retrieval had already
   * succeeded and the passages were in hand, so failing the whole answer
   * because one model was busy wasted work that was already done.
   */
  private async generate(prompt: string): Promise<string> {
    const plan = [this.primaryModel, ...(this.fallbackModel ? [this.fallbackModel] : [])];
    let lastErr: unknown;
    for (const name of plan) {
      try {
        const res = await this.getModel(name).generateContent(prompt);
        return res.response.text()?.trim() || '';
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const retryable = /\b(429|503)\b|high demand|UNAVAILABLE|overloaded/i.test(msg);
        if (!retryable) break;
        this.logger.warn(`${name} unavailable for a knowledge answer; trying the next model.`);
      }
    }
    throw lastErr;
  }

  // ── ingestion ──────────────────────────────────────────────────────

  /**
   * Index a document. Chunking and embedding happen inline; the row is marked
   * 'indexing' first and 'ready' only once every chunk is stored, so a run
   * that dies half way leaves a visibly incomplete document rather than one
   * that silently answers from a third of its content.
   */
  async ingestText(params: {
    scope: KbScope;
    workspaceId: string | null;
    title: string;
    text: string;
    sourceName?: string;
    mimeType?: string;
    uploadedBy?: string;
  }): Promise<KbDocument> {
    const { scope, workspaceId, title, text } = params;
    if (scope === 'workspace' && !workspaceId) {
      throw new BadRequestException('A workspace document needs a workspace.');
    }
    if (!text?.trim()) throw new BadRequestException('The document is empty.');

    const chunks = chunkDocument(title, text);
    if (!chunks.length) throw new BadRequestException('Nothing indexable in that document.');

    const [doc] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO public.kb_documents
         (scope, workspace_id, title, source_name, mime_type, byte_size, status, uploaded_by)
       VALUES ($1, $2::uuid, $3, $4, $5, $6, 'indexing', $7::uuid)
       RETURNING id`,
      scope, workspaceId, title.trim(), params.sourceName ?? null,
      params.mimeType ?? null, Buffer.byteLength(text), params.uploadedBy ?? null);

    try {
      const vectors = await this.embeddings.embedAll(
        chunks.map((c) => c.content), 'RETRIEVAL_DOCUMENT');

      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO public.kb_chunks
             (document_id, scope, workspace_id, chunk_index, heading, content, token_estimate, embedding)
           VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8::vector)`,
          doc.id, scope, workspaceId, c.index, c.heading, c.content, c.tokenEstimate,
          EmbeddingsService.toSqlVector(vectors[i]));
      }

      await this.prisma.$executeRawUnsafe(
        `UPDATE public.kb_documents SET status='ready', chunk_count=$2, updated_at=now() WHERE id=$1::uuid`,
        doc.id, chunks.length);
    } catch (err) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE public.kb_documents SET status='failed', error_message=$2, updated_at=now() WHERE id=$1::uuid`,
        doc.id, String((err as Error).message).slice(0, 400));
      this.logger.error(`Ingestion failed for "${title}": ${(err as Error).message}`);
      throw err;
    }

    return this.getDocument(doc.id);
  }

  async getDocument(id: string): Promise<KbDocument> {
    const [d] = await this.prisma.$queryRawUnsafe<KbDocument[]>(
      `SELECT id, scope, workspace_id, title, source_name, status, chunk_count,
              error_message, created_at
         FROM public.kb_documents WHERE id = $1::uuid`, id);
    if (!d) throw new NotFoundException('Document not found.');
    return d;
  }

  /** Documents this caller can see: platform docs plus their own workspace's. */
  async listDocuments(workspaceId: string | null): Promise<KbDocument[]> {
    return this.prisma.$queryRawUnsafe<KbDocument[]>(
      `SELECT id, scope, workspace_id, title, source_name, status, chunk_count,
              error_message, created_at
         FROM public.kb_documents
        WHERE scope = 'platform'
           OR ($1::uuid IS NOT NULL AND scope = 'workspace' AND workspace_id = $1::uuid)
        ORDER BY created_at DESC`, workspaceId);
  }

  /** Chunks cascade with the document. */
  async deleteDocument(id: string, workspaceId: string | null): Promise<void> {
    const doc = await this.getDocument(id);
    if (doc.scope === 'workspace' && doc.workspace_id !== workspaceId) {
      throw new NotFoundException('Document not found.');
    }
    await this.prisma.$executeRawUnsafe(`DELETE FROM public.kb_documents WHERE id = $1::uuid`, id);
  }

  // ── retrieval ──────────────────────────────────────────────────────

  /**
   * Find passages relevant to a question.
   *
   * The scope filter is inside the same statement as the vector ordering, so
   * it applies BEFORE ranking. Filtering after ranking would mean a query
   * could rank another practice's passages first and simply hide them - the
   * isolation has to be in the WHERE clause, not in the presentation.
   */
  async search(question: string, workspaceId: string | null, k = TOP_K): Promise<KbHit[]> {
    const qVec = await this.embeddings.embed(question, 'RETRIEVAL_QUERY');
    return this.prisma.$queryRawUnsafe<KbHit[]>(
      `SELECT c.document_id, c.chunk_index, c.heading, c.content, d.title,
              1 - (c.embedding <=> $1::vector) AS similarity
         FROM public.kb_chunks c
         JOIN public.kb_documents d ON d.id = c.document_id
        WHERE d.status = 'ready'
          AND (c.scope = 'platform'
               OR ($2::uuid IS NOT NULL AND c.scope = 'workspace' AND c.workspace_id = $2::uuid))
        ORDER BY c.embedding <=> $1::vector
        LIMIT $3`,
      EmbeddingsService.toSqlVector(qVec), workspaceId, k);
  }

  // ── grounded answer ────────────────────────────────────────────────

  async ask(question: string, workspaceId: string | null): Promise<KbAnswer> {
    const q = question?.trim();
    if (!q) throw new BadRequestException('Ask a question.');

    const hits = await this.search(q, workspaceId);
    const relevant = hits.filter((h) => Number(h.similarity) >= MIN_SIMILARITY);

    if (!relevant.length) {
      return {
        outcome: 'no_match',
        answer:
          "I don't have anything in my sources about that. If it should be covered, add the document to the knowledge base and ask me again.",
        citations: [],
      };
    }

    const context = relevant
      .map((h, i) => `[${i + 1}] ${h.title}${h.heading ? ' — ' + h.heading : ''}\n${h.content}`)
      .join('\n\n---\n\n');

    const prompt = [
      'Answer the question using ONLY the passages below.',
      '',
      'Rules:',
      '- If the passages do not contain the answer, say so plainly. Do not fill the gap from general knowledge.',
      '- Cite the passages you used as [1], [2] and so on, inline.',
      '- Be concise and specific. Prefer the wording of the source over your own paraphrase where precision matters.',
      '- You are addressing a qualified nutrition professional. Do not give medical advice, and do not soften a limitation the passages state.',
      '',
      'PASSAGES:',
      context,
      '',
      `QUESTION: ${q}`,
    ].join('\n');

    if (!this.genAI) {
      // No key: return the passages rather than nothing, so the feature still
      // has some value and the failure is obvious rather than silent.
      return {
        outcome: 'grounded',
        answer:
          'AI answering is unavailable (no GEMINI_API_KEY configured), but these passages look relevant:\n\n' +
          relevant.map((h, i) => `[${i + 1}] ${h.title}${h.heading ? ' — ' + h.heading : ''}`).join('\n'),
        citations: relevant.map(toCitation),
      };
    }

    let answer: string;
    try {
      answer = await this.generate(prompt);
    } catch (err) {
      // Retrieval already worked, so return the sources rather than nothing -
      // a nutritionist can read the passages even when the model is down.
      this.logger.error(`Knowledge answer failed: ${(err as Error).message}`);
      return {
        outcome: 'grounded',
        answer: [
          'The AI is temporarily unavailable, but these passages answer your question:',
          '',
          ...relevant.map(
            (h, i) => `[${i + 1}] ${h.title}${h.heading ? ' — ' + h.heading : ''}\n${h.content}`,
          ),
        ].join('\n\n'),
        citations: relevant.map(toCitation),
      };
    }

    return {
      outcome: 'grounded',
      answer: answer || 'No answer was produced.',
      citations: relevant.map(toCitation),
    };
  }
}

function toCitation(h: KbHit): KbCitation {
  return {
    document_id: h.document_id,
    title: h.title,
    heading: h.heading,
    chunk_index: h.chunk_index,
    similarity: Math.round(Number(h.similarity) * 1000) / 1000,
  };
}
