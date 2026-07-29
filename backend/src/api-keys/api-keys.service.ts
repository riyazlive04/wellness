import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';

/** Non-secret view of a key for the management list. */
export interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

const PREFIX = 'sk_live_';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Create a key. Returns the PLAINTEXT once — it is not stored and can never
   * be shown again (only its hash + a display prefix are persisted).
   */
  async create(
    workspaceId: string,
    userId: string,
    name: string,
  ): Promise<{ id: string; name: string; key: string; key_prefix: string; created_at: string }> {
    const clean = (name || '').trim().slice(0, 80) || 'API key';
    const secret = randomBytes(24).toString('base64url'); // ~32 url-safe chars
    const raw = `${PREFIX}${secret}`;
    const keyPrefix = `${PREFIX}${secret.slice(0, 6)}…`;
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ id: string; created_at: Date }>>(
      `INSERT INTO public.workspace_api_keys (workspace_id, name, key_prefix, key_hash, created_by)
       VALUES ($1::uuid, $2, $3, $4, $5::uuid)
       RETURNING id, created_at`,
      workspaceId, clean, keyPrefix, this.hash(raw), userId,
    );
    return { id: row.id, name: clean, key: raw, key_prefix: keyPrefix, created_at: row.created_at.toISOString() };
  }

  async list(workspaceId: string): Promise<ApiKeyRow[]> {
    return this.prisma.$queryRawUnsafe<ApiKeyRow[]>(
      `SELECT id, name, key_prefix, scopes,
              last_used_at::text AS last_used_at, created_at::text AS created_at,
              revoked_at::text AS revoked_at
         FROM public.workspace_api_keys
        WHERE workspace_id = $1::uuid
        ORDER BY (revoked_at IS NULL) DESC, created_at DESC`,
      workspaceId,
    );
  }

  async revoke(workspaceId: string, id: string): Promise<{ id: string }> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE public.workspace_api_keys SET revoked_at = now()
        WHERE id = $1::uuid AND workspace_id = $2::uuid AND revoked_at IS NULL
        RETURNING id`,
      id, workspaceId,
    );
    if (!rows.length) throw new NotFoundException('API key not found or already revoked.');
    return { id: rows[0].id };
  }

  /** Validate a presented key. Returns the owning workspace or null. */
  async verify(raw: string): Promise<{ workspaceId: string; keyId: string } | null> {
    if (!raw || !raw.startsWith(PREFIX)) return null;
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ id: string; workspace_id: string }>>(
      `SELECT id, workspace_id FROM public.workspace_api_keys
        WHERE key_hash = $1 AND revoked_at IS NULL LIMIT 1`,
      this.hash(raw),
    );
    if (!row) return null;
    // Best-effort "last used" stamp — never block the request on it.
    void this.prisma
      .$executeRawUnsafe(`UPDATE public.workspace_api_keys SET last_used_at = now() WHERE id = $1::uuid`, row.id)
      .catch(() => undefined);
    return { workspaceId: row.workspace_id, keyId: row.id };
  }

  // ── Read endpoints exposed over the public (key-authed) API ──────────

  async listClients(workspaceId: string, limit: number, offset: number) {
    const lim = Math.min(200, Math.max(1, limit || 50));
    const off = Math.max(0, offset || 0);
    return this.prisma.$queryRawUnsafe(
      `SELECT id, name, status::text AS status, created_at::text AS created_at
         FROM public.clients
        WHERE workspace_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      workspaceId, lim, off,
    );
  }

  async getClient(workspaceId: string, id: string) {
    const [row] = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, name, status::text AS status, created_at::text AS created_at
         FROM public.clients
        WHERE workspace_id = $1::uuid AND id = $2::uuid
        LIMIT 1`,
      workspaceId, id,
    );
    if (!row) throw new NotFoundException('Client not found.');
    return row;
  }
}
