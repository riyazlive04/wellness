import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AssistantContextService } from '../ai-assistant/assistant-context.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import { chunkDocument } from './chunker';
import {
  buildClientAnswer,
  buildDocumentAnswer,
  buildLiveAnswer,
  buildPlatformAnswer,
  detectFacet,
  detectPlatformIntent,
  asksForComparison,
  detectLiveIntent,
  NO_MATCH_MESSAGE,
  NO_PRACTICE_MESSAGE,
  asksAboutOwnPractice,
  unknownProperNouns,
} from './answer-builder';

/**
 * Knowledge base — ingestion, retrieval, and grounded answers.
 *
 * No language model is involved in answering. Retrieval is Postgres full-text
 * search and every reply is either a figure read from the database or a passage
 * quoted verbatim, so an answer cannot drift from its source: there is no step
 * between the source and the reader that could reword it.
 *
 * The cost is that questions must be phrased in terms the corpus actually uses.
 * That is the accepted trade: in a product used by clinicians, a confident
 * invented answer is worse than an honest miss, because it is indistinguishable
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
  /**
   * The bracket number this passage carries in the answer text. Not a list
   * position - dropping uncited passages would otherwise renumber the rest and
   * leave the source list disagreeing with the prose.
   */
  marker: number;
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
  /** What the answer drew on, so the UI can be honest about which. */
  used: { documents: boolean; workspace: boolean };
}

/**
 * Below this score a passage is not really about the question.
 *
 * Calibrated against the live corpus rather than guessed: a genuine match
 * scores 0.93-1.00, because a heading hit carries full weight, while the best
 * incidental match across a range of off-topic questions reached 0.78. Sitting
 * the bar between them is what stops an unrelated section being appended to an
 * answer that was already complete.
 */
/**
 * Two bars, because the same score means different things depending on what
 * else the answer already has.
 *
 * When live data has already answered the question, a passage has to be
 * clearly on topic to earn a place beside it - otherwise a correct reply picks
 * up an unrelated section as decoration. When there is nothing else, the best
 * available passage is worth showing even if it is a loose match, because the
 * alternative is refusing a question the corpus does cover. The similarity
 * percentage is displayed either way, so a weak match reads as weak.
 */
const STRONG_MATCH = 0.5;
const WEAK_MATCH = 0.1;
const TOP_K = 4;

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);
  /** Capitalised terms the indexed guide uses. Built once, then reused. */
  private vocabulary: Set<string> | null = null;

  /** Dropped whenever platform documents change, so new terms are picked up. */
  private forgetVocabulary(): void {
    this.vocabulary = null;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: AssistantContextService,
  ) {
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
      // No embedding step: retrieval is full-text, and the tsv column is
      // generated by the database on insert.
      for (const c of chunks) {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO public.kb_chunks
             (document_id, scope, workspace_id, chunk_index, heading, content, token_estimate)
           VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7)`,
          doc.id, scope, workspaceId, c.index, c.heading, c.content, c.tokenEstimate);
      }

      await this.prisma.$executeRawUnsafe(
        `UPDATE public.kb_documents SET status='ready', chunk_count=$2, updated_at=now() WHERE id=$1::uuid`,
        doc.id, chunks.length);
      if (scope === 'platform') this.forgetVocabulary();
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
  /**
   * Delete a document, if it belongs to the caller.
   *
   * Platform documents are shared by every workspace, so deleting one empties
   * part of the corpus for all of them - that is a super admin's decision, not
   * a tenant's. A workspace document is invisible outside its workspace, so an
   * attempt from elsewhere gets "not found" rather than "forbidden": confirming
   * the id exists would leak that it does.
   */
  async deleteDocument(id: string, workspaceId: string | null, isSuperAdmin = false): Promise<void> {
    const doc = await this.getDocument(id);
    if (doc.scope === 'platform' && !isSuperAdmin) {
      throw new ForbiddenException('Platform documents can only be removed by a super admin.');
    }
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
  /**
   * Find passages by text, entirely inside Postgres.
   *
   * Two signals are combined because each fails where the other holds.
   * Full-text ranking handles stemming and word order but scores zero when a
   * question shares no lexemes with the passage; trigram similarity still
   * scores partial overlap on product names, plurals and near-misspellings.
   * Taking the greater of the two means a question only has to succeed on one.
   *
   * The text query ORs the question's lexemes rather than ANDing them, so a
   * question phrased differently from the guide still ranks by how much of it
   * matched. Requiring every word meant anything short of quoting the heading
   * found nothing at all.
   *
   * Both signals already land in 0..1, so neither is rescaled - an earlier
   * version multiplied the text rank to "spread" it and pushed every real
   * match to the ceiling, where ties broke arbitrarily and the wrong section
   * led the answer.
   */
  async search(question: string, workspaceId: string | null, k = TOP_K): Promise<KbHit[]> {
    const q = question.trim();
    if (!q) return [];
    return this.prisma.$queryRawUnsafe<KbHit[]>(
      `WITH q AS (
         SELECT string_agg(lexeme, ' | ')::tsquery AS tsq
           FROM unnest(to_tsvector('english', $1))
       ),
       scored AS (
         SELECT c.document_id, c.chunk_index, c.heading, c.content, d.title,
                ts_rank(c.tsv, (SELECT tsq FROM q)) AS rank,
                GREATEST(
                  similarity(coalesce(c.heading, ''), $1),
                  similarity(left(c.content, 1000), $1)
                ) AS trg
           FROM public.kb_chunks c
           JOIN public.kb_documents d ON d.id = c.document_id
          WHERE d.status = 'ready'
            AND (c.scope = 'platform'
                 OR ($2::uuid IS NOT NULL AND c.scope = 'workspace' AND c.workspace_id = $2::uuid))
            -- Both predicates are index-backed (GIN on tsv, GIN trigram on
            -- heading). Without them the trigram similarity was computed for
            -- every chunk in the table on every question.
            AND (c.tsv @@ (SELECT tsq FROM q) OR c.heading % $1)
       )
       SELECT document_id, chunk_index, heading, content, title,
              GREATEST(rank, trg) AS similarity
         FROM scored
        WHERE rank > 0 OR trg > 0.3
        ORDER BY similarity DESC
        LIMIT $3`,
      q, workspaceId, k);
  }

  // ── grounded answer ────────────────────────────────────────────────

  /**
   * Answer a nutritionist's question from two sources at once.
   *
   * Documents alone cannot answer half of what gets asked. "How do I assign a
   * program?" lives in an indexed passage; "which of my clients need attention
   * today?" never will, because it is live state. Retrieval and workspace
   * context are gathered together and handed to the model as two separated
   * blocks.
   *
   * They stay separate in the prompt on purpose. Passages are quotable and get
   * cited; workspace figures are current readings that would be wrong to cite
   * as if they came from a document, and misleading if repeated back later as
   * though still true.
   */
  /**
   * Answer from documents and live workspace state, without a model.
   *
   * Three sources are tried in the order a nutritionist would expect them to
   * win. A question naming one of their clients is about that client. A
   * question matching a known workspace intent is about the practice. Anything
   * else is a documentation question.
   *
   * Live answers and document answers are both returned when both apply, since
   * "what program is Aakash on, and how is progress calculated" is one
   * question with two halves.
   */
  async ask(question: string, user: AuthUser): Promise<KbAnswer> {
    const q = question?.trim();
    if (!q) throw new BadRequestException('Ask a question.');

    const workspaceId = user.workspaceId ?? null;
    const [hits, live] = await Promise.all([
      this.search(q, workspaceId),
      this.liveAnswer(q, user),
    ]);

    // A passage stands beside a live answer only if it is clearly on topic;
    // on its own it only has to beat the weak bar.
    const bar = live || asksForComparison(q) ? STRONG_MATCH : WEAK_MATCH;
    const relevant = hits.filter((h) => Number(h.similarity) >= bar);
    const used = { documents: relevant.length > 0, workspace: !!live };

    if (!used.documents && !used.workspace) {
      return { outcome: 'no_match', answer: NO_MATCH_MESSAGE, citations: [], used };
    }

    const parts: string[] = [];
    if (live) parts.push(live);
    if (used.documents) {
      parts.push(
        (live ? 'From your guide:\n\n' : '') + buildDocumentAnswer(relevant),
      );
    }

    return {
      outcome: 'grounded',
      answer: parts.join('\n\n'),
      citations: used.documents ? relevant.map((h, i) => toCitation(h, i + 1)) : [],
      used,
    };
  }

  /**
   * Proper nouns in the question that the guide's vocabulary does not contain.
   *
   * Built from platform documents only. A workspace's own uploads are excluded
   * deliberately: one tenant's document must not shape how another tenant's
   * questions are interpreted, and the shared guide is identical for everyone.
   */
  private async unknownNames(question: string): Promise<string[]> {
    if (!this.vocabulary) {
      try {
        const rows = await this.prisma.$queryRawUnsafe<Array<{ word: string }>>(
          `SELECT DISTINCT lower(m[1]) AS word
             FROM public.kb_chunks c,
                  regexp_matches(coalesce(c.heading, '') || ' ' || c.content,
                                 '[A-Z][a-z]{2,}', 'g') AS m
            WHERE c.scope = 'platform'`,
        );
        this.vocabulary = new Set(rows.map((r) => r.word));
      } catch (err) {
        // Without a vocabulary every capitalised word looks like a name, which
        // would refuse far too much. An empty set disables the guard instead.
        this.logger.warn(`Vocabulary unavailable: ${(err as Error).message}`);
        this.vocabulary = new Set();
      }
    }
    if (!this.vocabulary.size) return [];
    return unknownProperNouns(question, this.vocabulary);
  }

  /**
   * The live half: a named client's record, or a workspace figure.
   *
   * Never allowed to fail the request — if these queries error the documents
   * should still answer, rather than the whole question failing because one
   * dashboard number was unavailable.
   */
  private async liveAnswer(question: string, user: AuthUser): Promise<string | null> {
    const workspaceId = user.workspaceId ?? null;
    if (!workspaceId && !user.isSuperAdmin) return null;
    try {
      // A super admin without a workspace sees the platform, not a practice.
      if (!workspaceId) {
        if (asksAboutOwnPractice(question)) return NO_PRACTICE_MESSAGE;
        const intent = detectPlatformIntent(question);
        if (!intent) return null;
        const ctx = await this.context.build(user, 'executive');
        return buildPlatformAnswer(intent, ctx?.data ?? {});
      }

      const clients = await this.context.clientData(workspaceId, question);
      if (clients.length) {
        const facet = detectFacet(question);
        return clients.map((c) => buildClientAnswer(c.name, c.data, facet)).join('\n\n');
      }

      // A question naming someone who is not on the roster is about that
      // person, not about the practice. Answering it with a workspace figure
      // would be replying to a question nobody asked.
      if ((await this.unknownNames(question)).length) return null;

      const intent = detectLiveIntent(question);
      if (!intent) return null;

      const ctx = await this.context.build(user, 'clinical');
      const data = ctx?.data ?? {};
      if (!Object.keys(data).length) return null;
      return buildLiveAnswer(intent, data);
    } catch (err) {
      this.logger.warn(`Live lookup unavailable: ${(err as Error).message}`);
      return null;
    }
  }

}

function toCitation(h: KbHit, marker: number): KbCitation {
  return {
    marker,
    document_id: h.document_id,
    title: h.title,
    heading: h.heading,
    chunk_index: h.chunk_index,
    similarity: Math.round(Number(h.similarity) * 1000) / 1000,
  };
}
