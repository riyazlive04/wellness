import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../database/prisma.service';
import {
  AuthUser,
  SupabaseJwtPayload,
  WorkspaceMemberRole,
} from '../types/auth-user.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('SUPABASE_JWT_SECRET'),
      audience: 'authenticated',
      algorithms: ['HS256'],
    });
  }

  /**
   * Called once per request after JWT signature passes. Enriches the AuthUser
   * with workspace + role info from the DB. Two queries:
   *   1. user_roles → app-level roles (super_admin / admin / client / manager)
   *   2. workspace_members → primary workspace + role inside it
   *
   * Tolerant of missing schema: a failed lookup logs + falls back to defaults
   * rather than throwing (lets the backend keep serving while the migration
   * catches up).
   */
  async validate(payload: SupabaseJwtPayload): Promise<AuthUser> {
    const userId = payload.sub;

    let appRoles: string[] = [];
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ role: string }>>(
        `SELECT role::text AS role FROM public.user_roles WHERE user_id = $1`,
        userId,
      );
      appRoles = rows.map((r) => r.role);
    } catch (err) {
      this.logger.warn(`user_roles lookup failed for ${userId}: ${(err as Error).message}`);
    }

    // Roles passed via JWT app_metadata (e.g. for super_admins not yet
    // in user_roles). Merge + dedup.
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
          WHERE user_id = $1 AND status = 'active'
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

    // JWT-supplied workspace_id wins if explicitly set (lets super_admin
    // impersonate / scope to a specific workspace via custom JWT claim).
    if (payload.app_metadata?.workspace_id) {
      workspaceId = payload.app_metadata.workspace_id;
    }

    const isSuperAdmin = merged.has('super_admin');
    const isClient = merged.has('client');

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
