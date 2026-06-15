import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { exportSPKI, importJWK, type JWK } from 'jose';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { PrismaService } from '../../database/prisma.service';
import {
  AuthUser,
  OrgRole,
  SupabaseJwtPayload,
  WorkspaceMemberRole,
} from '../types/auth-user.type';
import {
  PERMISSIONS,
  computeEffectivePermissions,
  type OverrideEffect,
} from '../permissions';

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

    // Active-workspace pin (Module 2 — workspace switching + impersonation).
    // A user can pin a workspace other than their oldest membership; a super
    // admin can pin one they don't belong to (impersonation). We honour the pin
    // only when it's valid for this caller.
    let isImpersonating = false;
    try {
      const [pref] = await this.prisma.$queryRawUnsafe<
        Array<{ workspace_id: string; is_impersonation: boolean }>
      >(
        `SELECT workspace_id, is_impersonation FROM public.user_workspace_preference
          WHERE user_id = $1::uuid LIMIT 1`,
        userId,
      );
      if (pref) {
        const superAdminImpersonation = pref.is_impersonation && merged.has('super_admin');
        if (superAdminImpersonation) {
          workspaceId = pref.workspace_id;
          workspaceRole = null; // super admin bypasses role checks anyway
          isImpersonating = true;
        } else {
          // Regular switch — only honour it if still an active member.
          const [m] = await this.prisma.$queryRawUnsafe<Array<{ role: WorkspaceMemberRole }>>(
            `SELECT role::text AS role FROM public.workspace_members
              WHERE user_id = $1::uuid AND workspace_id = $2::uuid AND status = 'active' LIMIT 1`,
            userId,
            pref.workspace_id,
          );
          if (m) {
            workspaceId = pref.workspace_id;
            workspaceRole = m.role;
          }
        }
      }
    } catch (err) {
      this.logger.warn(`active-workspace lookup failed for ${userId}: ${(err as Error).message}`);
    }

    // Organization memberships — independent of workspace, since orgs can
    // exist before any workspace is attached.
    const organizationIds: string[] = [];
    const organizationRoles: Record<string, OrgRole> = {};
    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{ organization_id: string; role: OrgRole }>
      >(
        `SELECT organization_id, role::text AS role
           FROM public.organization_members
          WHERE user_id = $1::uuid AND status = 'active'`,
        userId,
      );
      for (const row of rows) {
        organizationIds.push(row.organization_id);
        organizationRoles[row.organization_id] = row.role;
      }
    } catch (err) {
      this.logger.warn(`organization_members lookup failed for ${userId}: ${(err as Error).message}`);
    }

    // Primary org = the one that owns the user's primary workspace, falling
    // back to the first direct org membership.
    let organizationId: string | null = null;
    if (workspaceId) {
      try {
        const rows = await this.prisma.$queryRawUnsafe<Array<{ organization_id: string | null }>>(
          `SELECT organization_id FROM public.workspaces WHERE id = $1::uuid`,
          workspaceId,
        );
        organizationId = rows[0]?.organization_id ?? null;
      } catch (err) {
        this.logger.warn(`workspace→org lookup failed for ${workspaceId}: ${(err as Error).message}`);
      }
    }
    if (!organizationId && organizationIds.length > 0) {
      organizationId = organizationIds[0];
    }

    const isSuperAdmin = merged.has('super_admin');
    const isClient = merged.has('client');

    // Effective fine-grained permissions for the primary workspace.
    //   - super_admin, or org_owner/org_admin of the workspace's org → ALL
    //   - workspace member → role defaults ± per-user overrides
    //   - otherwise → none
    let permissions: string[] = [];
    const orgRoleHere = organizationId ? organizationRoles[organizationId] : undefined;
    if (isSuperAdmin || orgRoleHere === 'org_owner' || orgRoleHere === 'org_admin') {
      permissions = [...PERMISSIONS];
    } else if (workspaceId && workspaceRole) {
      let overrides: Array<{ permission: string; effect: OverrideEffect }> = [];
      try {
        overrides = await this.prisma.$queryRawUnsafe<Array<{ permission: string; effect: OverrideEffect }>>(
          `SELECT permission, effect FROM public.workspace_permission_overrides
            WHERE workspace_id = $1::uuid AND user_id = $2::uuid`,
          workspaceId,
          userId,
        );
      } catch (err) {
        this.logger.warn(`permission overrides lookup failed for ${userId}: ${(err as Error).message}`);
      }
      permissions = computeEffectivePermissions(workspaceRole, overrides);
    }

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
      organizationId,
      organizationIds,
      organizationRoles,
      permissions,
      appRoles: [...merged],
      isClient,
      isImpersonating,
    };
  }
}