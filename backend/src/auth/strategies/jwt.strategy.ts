import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { exportSPKI, importJWK, type JWK } from 'jose';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { PrismaService } from '../../database/prisma.service';
import { AuthCacheService } from '../auth-cache.service';
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
    private readonly authCache: AuthCacheService,
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

    // Fast path: a recently-resolved identity for this user. A single page load
    // fires many API calls within seconds; this collapses their DB work to one.
    const cached = await this.authCache.get(userId);
    if (cached) {
      this.applyTenantStore(cached);
      return cached;
    }

    // Batch 1 — four independent lookups (keyed only by userId) in parallel.
    // Casting $1 to uuid is required — Postgres won't auto-coerce text→uuid.
    const [appRoleRows, primaryRows, prefRows, orgRows] = await Promise.all([
      this.query<{ role: string }>(
        `SELECT role::text AS role FROM public.user_roles WHERE user_id = $1::uuid`,
        [userId],
        'user_roles',
        true, // critical — a failure must not misclassify super_admin/client
      ),
      this.query<{ workspace_id: string; role: WorkspaceMemberRole }>(
        `SELECT workspace_id, role::text AS role
           FROM public.workspace_members
          WHERE user_id = $1::uuid AND status = 'active'
          ORDER BY joined_at ASC LIMIT 1`,
        [userId],
        'workspace_members',
        true, // critical — a failure must not downgrade an owner to 'unaffiliated'
      ),
      this.query<{ workspace_id: string; is_impersonation: boolean }>(
        `SELECT workspace_id, is_impersonation FROM public.user_workspace_preference
          WHERE user_id = $1::uuid LIMIT 1`,
        [userId],
        'user_workspace_preference',
      ),
      this.query<{ organization_id: string; role: OrgRole }>(
        `SELECT organization_id, role::text AS role
           FROM public.organization_members
          WHERE user_id = $1::uuid AND status = 'active'`,
        [userId],
        'organization_members',
      ),
    ]);

    const appRoles = appRoleRows.map((r) => r.role);
    const jwtRoles = payload.app_metadata?.roles ?? [];
    const merged = new Set([...appRoles, ...jwtRoles]);
    const isSuperAdmin = merged.has('super_admin');
    const isClient = merged.has('client');

    let workspaceId: string | null = primaryRows[0]?.workspace_id ?? null;
    let workspaceRole: WorkspaceMemberRole | null = primaryRows[0]?.role ?? null;
    if (payload.app_metadata?.workspace_id) {
      workspaceId = payload.app_metadata.workspace_id;
    }

    // Active-workspace pin (Module 2 — switching + impersonation). A super admin
    // can pin a workspace they don't belong to (impersonation); everyone else
    // only if still an active member of the target.
    let isImpersonating = false;
    const pref = prefRows[0];
    if (pref) {
      if (pref.is_impersonation && isSuperAdmin) {
        workspaceId = pref.workspace_id;
        workspaceRole = null; // super admin bypasses role checks anyway
        isImpersonating = true;
      } else {
        const [m] = await this.query<{ role: WorkspaceMemberRole }>(
          `SELECT role::text AS role FROM public.workspace_members
            WHERE user_id = $1::uuid AND workspace_id = $2::uuid AND status = 'active' LIMIT 1`,
          [userId, pref.workspace_id],
          'workspace_members(pin)',
        );
        if (m) {
          workspaceId = pref.workspace_id;
          workspaceRole = m.role;
        }
      }
    }

    const organizationIds: string[] = [];
    const organizationRoles: Record<string, OrgRole> = {};
    for (const row of orgRows) {
      organizationIds.push(row.organization_id);
      organizationRoles[row.organization_id] = row.role;
    }

    // Batch 2 — workspace→org and per-user permission overrides in parallel.
    // We fetch overrides whenever they *might* be needed (member, not super
    // admin); they're cheap and ignored if an org-level role grants everything.
    const needsOverrides = !!workspaceId && !!workspaceRole && !isSuperAdmin;
    const [wsOrgRows, overrideRows] = await Promise.all([
      workspaceId
        ? this.query<{ organization_id: string | null }>(
            `SELECT organization_id FROM public.workspaces WHERE id = $1::uuid`,
            [workspaceId],
            'workspace→org',
          )
        : Promise.resolve([] as Array<{ organization_id: string | null }>),
      needsOverrides
        ? this.query<{ permission: string; effect: OverrideEffect }>(
            `SELECT permission, effect FROM public.workspace_permission_overrides
              WHERE workspace_id = $1::uuid AND user_id = $2::uuid`,
            [workspaceId, userId],
            'permission_overrides',
          )
        : Promise.resolve([] as Array<{ permission: string; effect: OverrideEffect }>),
    ]);

    // Primary org = the one owning the primary workspace, else first direct org.
    let organizationId: string | null = wsOrgRows[0]?.organization_id ?? null;
    if (!organizationId && organizationIds.length > 0) {
      organizationId = organizationIds[0];
    }

    // Effective fine-grained permissions:
    //   super_admin / org_owner / org_admin → ALL; member → role ± overrides.
    let permissions: string[] = [];
    const orgRoleHere = organizationId ? organizationRoles[organizationId] : undefined;
    if (isSuperAdmin || orgRoleHere === 'org_owner' || orgRoleHere === 'org_admin') {
      permissions = [...PERMISSIONS];
    } else if (workspaceId && workspaceRole) {
      permissions = computeEffectivePermissions(workspaceRole, overrideRows);
    }

    const user: AuthUser = {
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

    await this.authCache.set(userId, user);
    this.applyTenantStore(user);
    return user;
  }

  /**
   * Run a raw query, tolerating a missing table / transient error by logging
   * and returning an empty result (the original per-lookup try/catch behaviour).
   */
  private async query<T>(sql: string, params: unknown[], label: string, critical = false): Promise<T[]> {
    try {
      return await this.prisma.$queryRawUnsafe<T[]>(sql, ...params);
    } catch (err) {
      this.logger.warn(`${label} lookup failed: ${(err as Error).message}`);
      // Identity-defining lookups (roles, workspace membership) must NOT degrade
      // to an empty result on a transient DB blip — that would resolve a real
      // workspace owner as 'unaffiliated' and bounce them to /onboarding (and
      // cache that wrong identity). Fail the request instead so the client keeps
      // its last known-good scope and retries once the DB recovers.
      if (critical) {
        throw new ServiceUnavailableException('Identity lookup temporarily unavailable — please retry.');
      }
      return [];
    }
  }

  /** Mirror the resolved identity into the per-request tenant context store. */
  private applyTenantStore(user: AuthUser): void {
    const store = this.tenant.store();
    if (store) {
      store.workspaceId = user.workspaceId;
      store.userId = user.id;
      store.isSuperAdmin = user.isSuperAdmin;
    }
  }
}