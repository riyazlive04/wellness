import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { decryptSecret, encryptSecret } from '../connections/secret-crypto';

export interface VideoKeyView {
  /** 'own' = the practice's Daily.co account; 'nusi' = NUSI's, counted against the plan's hours. */
  source: 'own' | 'nusi';
  status: 'missing' | 'connected' | 'error';
  last4: string | null;
  /** The Daily.co subdomain the key belongs to. */
  domain: string | null;
  last_error: string | null;
  last_tested_at: string | null;
}

/**
 * A practice's own Daily.co key for video calls. With one, its calls run on
 * its own Daily.co account and don't use the plan's monthly video hours.
 * The key is tested with Daily.co before it's stored, stored encrypted, and
 * never returned.
 */
@Injectable()
export class VideoKeysService {
  private readonly cache = new Map<string, { key: string | null; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  /** The practice's working Daily.co key, or null to use NUSI's. */
  async resolve(workspaceId: string): Promise<string | null> {
    const hit = this.cache.get(workspaceId);
    if (hit && Date.now() - hit.at < 60_000) return hit.key;
    let key: string | null = null;
    try {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ key_enc: string; status: string }>>(
        `SELECT key_enc, status FROM public.workspace_video_keys WHERE workspace_id = $1::uuid LIMIT 1`,
        workspaceId,
      );
      if (r && r.status === 'connected') key = decryptSecret(r.key_enc);
    } catch {
      key = null;
    }
    this.cache.set(workspaceId, { key, at: Date.now() });
    return key;
  }

  async view(workspaceId: string): Promise<VideoKeyView> {
    const [r] = await this.prisma.$queryRawUnsafe<Array<{
      key_last4: string; domain_name: string | null; status: 'connected' | 'error'; last_error: string | null; last_tested_at: Date | null;
    }>>(
      `SELECT key_last4, domain_name, status, last_error, last_tested_at
         FROM public.workspace_video_keys WHERE workspace_id = $1::uuid LIMIT 1`,
      workspaceId,
    );
    if (!r) return { source: 'nusi', status: 'missing', last4: null, domain: null, last_error: null, last_tested_at: null };
    return {
      source: r.status === 'connected' ? 'own' : 'nusi',
      status: r.status,
      last4: r.key_last4,
      domain: r.domain_name,
      last_error: r.last_error,
      last_tested_at: r.last_tested_at ? r.last_tested_at.toISOString() : null,
    };
  }

  /** Check the key with Daily.co, then store it encrypted. Refuses a key that doesn't work. */
  async save(workspaceId: string, userId: string, rawKey: string): Promise<VideoKeyView> {
    const key = rawKey.trim();
    if (key.length < 20) throw new BadRequestException('That doesn\'t look like a complete Daily.co API key.');
    const test = await testDailyKey(key);
    if (!test.ok) throw new BadRequestException(`Daily.co rejected this key: ${test.error}`);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO public.workspace_video_keys
         (workspace_id, provider, key_enc, key_last4, domain_name, status, last_error, last_tested_at, created_by, updated_at)
       VALUES ($1::uuid, 'daily', $2, $3, $4, 'connected', NULL, now(), $5::uuid, now())
       ON CONFLICT (workspace_id) DO UPDATE SET
         key_enc = EXCLUDED.key_enc, key_last4 = EXCLUDED.key_last4, domain_name = EXCLUDED.domain_name,
         status = 'connected', last_error = NULL, last_tested_at = now(),
         created_by = EXCLUDED.created_by, updated_at = now()`,
      workspaceId,
      encryptSecret(key),
      key.slice(-4),
      test.domain,
      userId,
    );
    this.cache.delete(workspaceId);
    return this.view(workspaceId);
  }

  /** Test the stored key again (e.g. after the practice fixed its Daily.co billing). */
  async retest(workspaceId: string): Promise<VideoKeyView> {
    const [r] = await this.prisma.$queryRawUnsafe<Array<{ key_enc: string }>>(
      `SELECT key_enc FROM public.workspace_video_keys WHERE workspace_id = $1::uuid LIMIT 1`,
      workspaceId,
    );
    if (!r) return this.view(workspaceId);
    const test = await testDailyKey(decryptSecret(r.key_enc));
    await this.prisma.$executeRawUnsafe(
      `UPDATE public.workspace_video_keys
          SET status = $2, last_error = $3, domain_name = COALESCE($4, domain_name), last_tested_at = now(), updated_at = now()
        WHERE workspace_id = $1::uuid`,
      workspaceId,
      test.ok ? 'connected' : 'error',
      test.ok ? null : test.error,
      test.ok ? test.domain : null,
    );
    this.cache.delete(workspaceId);
    return this.view(workspaceId);
  }

  async remove(workspaceId: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(`DELETE FROM public.workspace_video_keys WHERE workspace_id = $1::uuid`, workspaceId);
    this.cache.delete(workspaceId);
  }
}

/** A cheap authenticated call: read the account's domain. Never logs the key. */
export async function testDailyKey(key: string): Promise<{ ok: true; domain: string | null } | { ok: false; error: string }> {
  try {
    const res = await fetch('https://api.daily.co/v1/', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { domain_name?: string };
      return { ok: true, domain: body.domain_name ?? null };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'the key is not valid' };
    return { ok: false, error: `Daily.co answered ${res.status}` };
  } catch {
    return { ok: false, error: 'could not reach Daily.co' };
  }
}
