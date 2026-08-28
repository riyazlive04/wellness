import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Text → vector, via the Gemini embeddings REST API.
 *
 * Called over REST rather than through @google/generative-ai because the
 * installed SDK version does not expose `outputDimensionality`, and that
 * parameter is not optional for us: the model returns 3072 dimensions by
 * default, while pgvector's index types cap at 2000. A 3072-wide column can be
 * stored but never indexed, so every search would fall back to a sequential
 * scan of the whole corpus.
 *
 * DIMENSIONS ARE A CONTRACT. kb_chunks.embedding is vector(768). Every vector
 * written, and every query vector compared against them, must be 768. Change
 * one and you must re-embed everything - mismatched vectors do not error, they
 * just rank nonsensically.
 */

const MODEL = 'gemini-embedding-001';
const DIMENSIONS = 768;
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`;

/**
 * Gemini distinguishes the two sides of a search. Embedding a stored passage
 * and embedding the question asked of it with the same task type measurably
 * weakens retrieval, so the caller always says which side it is on.
 */
export type EmbedTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  static readonly DIMENSIONS = DIMENSIONS;

  constructor(private readonly config: ConfigService) {}

  private key(): string {
    const k = this.config.get<string>('GEMINI_API_KEY');
    if (!k) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY is not set, so documents cannot be indexed or searched.',
      );
    }
    return k;
  }

  /** Embed one piece of text. Returns exactly DIMENSIONS floats. */
  async embed(text: string, task: EmbedTask): Promise<number[]> {
    const body = {
      model: `models/${MODEL}`,
      content: { parts: [{ text }] },
      taskType: task,
      outputDimensionality: DIMENSIONS,
    };

    const res = await fetch(`${ENDPOINT}?key=${this.key()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Embedding failed (${res.status}): ${detail.slice(0, 200)}`);
      throw new ServiceUnavailableException(
        res.status === 429
          ? 'Embedding rate limit reached. Try again shortly.'
          : `Could not generate an embedding (${res.status}).`,
      );
    }

    const json = (await res.json()) as { embedding?: { values?: number[] } };
    const values = json.embedding?.values;
    if (!values?.length) {
      throw new ServiceUnavailableException('The embedding service returned an empty vector.');
    }
    if (values.length !== DIMENSIONS) {
      // Loud rather than silent: a wrong width would be written happily and
      // only surface later as retrieval that returns plausible nonsense.
      throw new ServiceUnavailableException(
        `Expected ${DIMENSIONS}-dim embedding, got ${values.length}. Refusing to store it.`,
      );
    }
    return values;
  }

  /**
   * Embed many passages. Sequential with a small pause rather than parallel:
   * ingestion is a background job where finishing matters more than finishing
   * fast, and firing a hundred concurrent requests is the reliable way to be
   * rate-limited half way through a document.
   */
  async embedAll(texts: string[], task: EmbedTask): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      out.push(await this.embed(texts[i], task));
      if (i < texts.length - 1) await new Promise((r) => setTimeout(r, 120));
    }
    return out;
  }

  /** pgvector's text input format: '[0.1,0.2,...]'. */
  static toSqlVector(values: number[]): string {
    return `[${values.join(',')}]`;
  }
}
