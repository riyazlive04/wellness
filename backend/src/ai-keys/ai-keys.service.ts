import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { decryptSecret, encryptSecret } from '../connections/secret-crypto';

export type AiProvider = 'gemini' | 'openai';

export interface AiKey {
  provider: AiProvider;
  key: string;
}

/** What the settings page sees - never the key itself. */
export interface AiKeyView {
  provider: AiProvider | null;
  last4: string | null;
  status: 'connected' | 'error' | 'missing';
  last_error: string | null;
  last_tested_at: string | null;
}

/**
 * Thrown when a practice's AI feature runs without a key of its own. 402 +
 * a stable code, so the frontend can send the owner to Settings -> AI.
 */
export class AiKeyMissingException extends HttpException {
  constructor(message = 'AI features need your practice\'s own AI key. The practice owner can add a Google Gemini or OpenAI key in Settings -> AI.') {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'AI key required',
        code: 'ai_key_missing',
        message,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

const CACHE_MS = 60_000;

/**
 * Each practice's own AI key (bring your own key). Practice AI features run
 * on it; NUSI's own server keys are used only for platform work (the shared
 * food library, NUSI's sales pages, super-admin tools).
 */
@Injectable()
export class AiKeysService {
  private readonly logger = new Logger(AiKeysService.name);
  private readonly cache = new Map<string, { at: number; value: AiKey | null }>();

  constructor(private readonly prisma: PrismaService) {}

  /** The practice's key, or null. Cached briefly - AI calls are frequent. */
  async resolve(workspaceId: string | null | undefined): Promise<AiKey | null> {
    if (!workspaceId) return null;
    const hit = this.cache.get(workspaceId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    let value: AiKey | null = null;
    try {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ provider: AiProvider; key_enc: string }>>(
        `SELECT provider, key_enc FROM public.workspace_ai_keys WHERE workspace_id = $1::uuid LIMIT 1`,
        workspaceId,
      );
      if (r) value = { provider: r.provider, key: decryptSecret(r.key_enc) };
    } catch (err) {
      this.logger.warn(`AI key lookup failed for ${workspaceId}: ${(err as Error).message}`);
    }
    this.cache.set(workspaceId, { at: Date.now(), value });
    return value;
  }

  /** The practice's key, or a 402 telling the owner to add one. */
  async require(workspaceId: string | null | undefined): Promise<AiKey> {
    const k = await this.resolve(workspaceId);
    if (!k) throw new AiKeyMissingException();
    return k;
  }

  async view(workspaceId: string): Promise<AiKeyView> {
    const [r] = await this.prisma.$queryRawUnsafe<Array<{
      provider: AiProvider; key_last4: string; status: 'connected' | 'error'; last_error: string | null; last_tested_at: Date | null;
    }>>(
      `SELECT provider, key_last4, status, last_error, last_tested_at
         FROM public.workspace_ai_keys WHERE workspace_id = $1::uuid LIMIT 1`,
      workspaceId,
    );
    if (!r) return { provider: null, last4: null, status: 'missing', last_error: null, last_tested_at: null };
    return {
      provider: r.provider,
      last4: r.key_last4,
      status: r.status,
      last_error: r.last_error,
      last_tested_at: r.last_tested_at ? r.last_tested_at.toISOString() : null,
    };
  }

  /** Check the key with the provider, then store it encrypted. Refuses a key that doesn't work. */
  async save(workspaceId: string, userId: string, provider: AiProvider, rawKey: string): Promise<AiKeyView> {
    const key = rawKey.trim();
    if (key.length < 20) throw new BadRequestException('That doesn\'t look like a complete API key.');
    const test = await testAiKey(provider, key);
    if (!test.ok) throw new BadRequestException(`${provider === 'gemini' ? 'Google' : 'OpenAI'} rejected this key: ${test.error}`);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO public.workspace_ai_keys
         (workspace_id, provider, key_enc, key_last4, status, last_error, last_tested_at, created_by, updated_at)
       VALUES ($1::uuid, $2, $3, $4, 'connected', NULL, now(), $5::uuid, now())
       ON CONFLICT (workspace_id) DO UPDATE SET
         provider = EXCLUDED.provider, key_enc = EXCLUDED.key_enc, key_last4 = EXCLUDED.key_last4,
         status = 'connected', last_error = NULL, last_tested_at = now(),
         created_by = EXCLUDED.created_by, updated_at = now()`,
      workspaceId,
      provider,
      encryptSecret(key),
      key.slice(-4),
      userId,
    );
    this.cache.delete(workspaceId);
    return this.view(workspaceId);
  }

  /** Re-test the stored key (e.g. after the owner topped up their Google/OpenAI account). */
  async retest(workspaceId: string): Promise<AiKeyView> {
    const k = await this.resolve(workspaceId);
    if (!k) return this.view(workspaceId);
    const test = await testAiKey(k.provider, k.key);
    await this.prisma.$executeRawUnsafe(
      `UPDATE public.workspace_ai_keys
          SET status = $2, last_error = $3, last_tested_at = now(), updated_at = now()
        WHERE workspace_id = $1::uuid`,
      workspaceId,
      test.ok ? 'connected' : 'error',
      test.ok ? null : test.error,
    );
    return this.view(workspaceId);
  }

  async remove(workspaceId: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(`DELETE FROM public.workspace_ai_keys WHERE workspace_id = $1::uuid`, workspaceId);
    this.cache.delete(workspaceId);
  }
}

/** A cheap authenticated call: list models. Never logs the key. */
export async function testAiKey(provider: AiProvider, key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res =
      provider === 'gemini'
        ? await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}`, {
            signal: AbortSignal.timeout(10_000),
          })
        : await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(10_000),
          });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { ok: false, error: body?.error?.message?.slice(0, 200) || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
