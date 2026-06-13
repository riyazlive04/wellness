import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, importJWK, type JWK } from 'jose';
import { PrismaService } from '../database/prisma.service';

/**
 * RealtimeAuthService — verifies a Supabase JWT (HS256 or ES256), resolves
 * the user's workspace membership, and returns the subset of AuthUser the
 * Realtime gateway needs.
 *
 * Mirrors the verification rules from auth/strategies/jwt.strategy.ts so a
 * token accepted at REST is also accepted at the WS handshake. Lookups are
 * tolerant — a missing workspace returns null rather than throwing, which
 * lets unaffiliated super admins join the platform room.
 */
@Injectable()
export class RealtimeAuthService {
  private readonly logger = new Logger(RealtimeAuthService.name);
  private readonly hsSecret: Uint8Array;
  private readonly jwksUrl: string;
  private readonly jwksCache = new Map<string, CryptoKey>();

  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    this.hsSecret = new TextEncoder().encode(config.getOrThrow<string>('SUPABASE_JWT_SECRET'));
    this.jwksUrl = `${config.getOrThrow<string>('SUPABASE_URL')}/auth/v1/.well-known/jwks.json`;
  }

  /**
   * Resolve a JWT to a small AuthUser shape. Throws on signature/expiry failure,
   * unknown algorithm, or missing `sub`. Returns null for the workspace fields
   * if no membership exists (e.g. fresh super admin).
   */
  async resolveSocketUser(rawJwt: string): Promise<{
    user_id: string;
    is_super_admin: boolean;
    workspace_id: string | null;
    workspace_role: string | null;
  }> {
    if (!rawJwt) throw new Error('Missing token');

    const headerPart = rawJwt.split('.')[0];
    if (!headerPart) throw new Error('Malformed JWT');
    const headerJson = Buffer.from(headerPart, 'base64url').toString('utf8');
    const header = JSON.parse(headerJson) as { alg?: string; kid?: string };

    let payload: { sub?: unknown; aud?: unknown };
    if (header.alg === 'HS256') {
      const { payload: p } = await jwtVerify(rawJwt, this.hsSecret, {
        algorithms: ['HS256'], audience: 'authenticated',
      });
      payload = p;
    } else if (header.alg === 'ES256') {
      if (!header.kid) throw new Error('ES256 JWT missing kid');
      const key = await this.getJwksKey(header.kid);
      const { payload: p } = await jwtVerify(rawJwt, key, {
        algorithms: ['ES256'], audience: 'authenticated',
      });
      payload = p;
    } else {
      throw new Error(`Unsupported JWT algorithm: ${header.alg}`);
    }

    const userId = typeof payload.sub === 'string' ? payload.sub : null;
    if (!userId) throw new Error('JWT missing sub claim');

    // Workspace lookup — same query the JwtStrategy uses.
    let workspaceId: string | null = null;
    let workspaceRole: string | null = null;
    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{ workspace_id: string; role: string }>
      >(
        `SELECT workspace_id, role::text AS role
           FROM public.workspace_members
          WHERE user_id = $1::uuid AND status = 'active'
          ORDER BY joined_at ASC
          LIMIT 1`,
        userId,
      );
      if (rows.length > 0) {
        workspaceId = rows[0].workspace_id;
        workspaceRole = rows[0].role;
      }
    } catch (err) {
      this.logger.warn(`Workspace lookup failed for ${userId}: ${(err as Error).message}`);
    }

    let isSuperAdmin = false;
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count
           FROM public.user_roles
          WHERE user_id = $1::uuid AND role::text = 'super_admin'`,
        userId,
      );
      isSuperAdmin = rows[0] && Number(rows[0].count) > 0;
    } catch {
      // ignore — non-fatal
    }

    return {
      user_id: userId,
      is_super_admin: isSuperAdmin,
      workspace_id: workspaceId,
      workspace_role: workspaceRole,
    };
  }

  private async getJwksKey(kid: string): Promise<CryptoKey> {
    const cached = this.jwksCache.get(kid);
    if (cached) return cached;
    const res = await fetch(this.jwksUrl);
    if (!res.ok) throw new Error(`JWKS fetch ${res.status}`);
    const body = (await res.json()) as { keys?: Array<JWK & { kid?: string; alg?: string }> };
    const jwk = body.keys?.find((k) => k.kid === kid);
    if (!jwk) throw new Error(`JWKS key ${kid} not found`);
    const key = (await importJWK(jwk, jwk.alg ?? 'ES256')) as CryptoKey;
    this.jwksCache.set(kid, key);
    return key;
  }
}
