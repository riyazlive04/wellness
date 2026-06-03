import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { exportSPKI, importJWK, type JWK } from 'jose';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { PrismaService } from '../../database/prisma.service';
import {
  AuthUser,
  SupabaseJwtPayload,
  WorkspaceMemberRole,
} from '../types/auth-user.type';

/**
 * Module-level cache of PEM-encoded public keys per `kid`. Avoids re-fetching
 * JWKS on every request. Cache is permanent for the process lifetime — when
 * Supabase rotates keys (rare, manual op), restart the backend.
 */
const pemCache = new Map<string, string>();

interface JwksKey {
  kid?: string;
  alg?: string;
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
  [k: string]: unknown;
}

async function loadJwksPem(jwksUrl: string, kid: string): Promise<string> {
  const cached = pemCache.get(kid);
  if (cached) return cached;

  const res = await fetch(jwksUrl);
  if (!res.ok) throw new Error(`JWKS fetch ${res.status}`);
  const body = (await res.json()) as { keys?: JwksKey[] };
  const jwk = body.keys?.find((k) => k.kid === kid);
  if (!jwk) throw new Error(`JWKS key ${kid} not found at ${jwksUrl}`);
  // jose returns CryptoKey on Node 18+ when using subtle. exportSPKI accepts it.
  const key = await importJWK(jwk as JWK, jwk.alg ?? 'ES256');
  if (typeof (key as CryptoKey).type !== 'string') {
    throw new Error('importJWK did not return a CryptoKey');
  }
  const pem = await exportSPKI(key as CryptoKey);
  pemCache.set(kid, pem);
  return pem;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {
    const supabaseUrl = config.getOrThrow<string>('SUPABASE_URL');
    const hsSecret    = config.getOrThrow<string>('SUPABASE_JWT_SECRET');
    const jwksUrl     = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
    const log         = new Logger('JwtStrategy.secretProvider');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      audience: 'authenticated',
      // Accept both — modern Supabase signs with ES256, legacy tokens with HS256.
      algorithms: ['ES256', 'HS256'],
      // Per-request key resolution. Reads the JWT header to decide which key
      // material to verify with: shared secret for legacy HS256, JWKS-derived
      // PEM for ES256.
      secretOrKeyProvider: async (
        _req: unknown,
        rawJwt: string,
        done: (err: Error | null, key?: string | Buffer) => void,
      ): Promise<void> => {
        try {
          const headerPart = rawJwt.split('.')[0];
          if (!headerPart) return done(new Error('Malformed JWT: missing header'));
          const headerJson = Buffer.from(headerPart, 'base64url').toString('utf8');
          const header = JSON.parse(headerJson) as { alg?: string; kid?: string };

          if (header.alg === 'HS256') {
            done(null, hsSecret);
            return;
          }
          if (header.alg === 'ES256') {
            if (!header.kid) return done(new Error('ES256 JWT missing kid'));
            const pem = await loadJwksPem(jwksUrl, header.kid);
            done(null, pem);
            return;
          }
          done(new Error(`Unsupported JWT algorithm: ${header.alg}`));
        } catch (err) {
          log.warn(`Key resolution failed: ${(err as Error).message}`);
          done(err as Error);
        }
      },
    });
    this.logger.log(`JWT strategy ready (ES256 via ${jwksUrl}; HS256 fallback)`);
  }

  /**
   * Called once per request after JWT signature passes. Enriches the AuthUser
   * with workspace + role info from the DB. Two queries:
   *   1. user_roles → app-level roles (super_admin / admin / client / manager)
   *   2. workspace_members → primary workspace + role inside it
   *
   * Tolerant of missing schema: a failed lookup logs + falls back to defaults
   * rather than throwing.
   */
  async validate(payload: SupabaseJwtPayload): Promise<AuthUser> {
    const userId = payload.sub;

    let appRoles: string[] = [];
    try {
      // Cast $1 to uuid explicitly — Postgres doesn't auto-coerce text→uuid,
      // so `WHERE user_id = $1` would otherwise fail with 42883.
      const rows = await this.prisma.$queryRawUnsafe<Array<{ role: string }>>(
        `SELECT role::text AS role FROM public.user_roles WHERE user_id = $1::uuid`,
        userId,
      );
      appRoles = rows.map((r) => r.role);
    } catch (err) {
      this.logger.warn(`user_roles lookup failed for ${userId}: ${(err as Error).message}`);
    }

    const jwtRoles = payload.app_metadata?.roles ?? [];
    const merged = new Set([...appRoles, ...jwtRoles]);

    let workspaceId: string | null = null;
    let workspaceRole: WorkspaceMemberRole | null = null;
    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{ workspace_id: string; role: WorkspaceMemberRole }>
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
      this.logger.warn(`workspace_members lookup failed for ${userId}: ${(err as Error).message}`);
    }

    if (payload.app_metadata?.workspace_id) {
      workspaceId = payload.app_metadata.workspace_id;
    }

    const isSuperAdmin = merged.has('super_admin');
    const isClient = merged.has('client');

    const store = this.tenant.store();
    if (store) {
      store.workspaceId = workspaceId;
      store.userId = userId;
      store.isSuperAdmin = isSuperAdmin;
    }

    return {
      id: userId,
      email: payload.email,
      jwtRole: payload.role ?? 'authenticated',
      isSuperAdmin,
      workspaceId,
      workspaceRole,
      appRoles: [...merged],
      isClient,
    };
  }
}