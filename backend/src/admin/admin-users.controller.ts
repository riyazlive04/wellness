import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SuperAdmin } from '../auth/decorators/super-admin.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { AuthCacheService } from '../auth/auth-cache.service';
import { PrismaService } from '../database/prisma.service';
import { Audit } from './audit/audit.decorator';

class ListUsersQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

class InviteSuperAdminDto {
  @IsEmail() email!: string;
  /** Temporary password for a brand-new account; super admins hold the keys to every practice. */
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}

interface SupabaseAdminUser {
  id: string;
  email?: string;
  banned_until?: string | null;
}

@ApiTags('Admin · Users')
@ApiBearerAuth()
@SuperAdmin()
@Controller({ path: 'admin', version: '1' })
export class AdminUsersController {
  private readonly logger = new Logger(AdminUsersController.name);
  private readonly supabaseUrl: string;
  private readonly serviceKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authCache: AuthCacheService,
    config: ConfigService,
  ) {
    this.supabaseUrl = config.getOrThrow<string>('SUPABASE_URL');
    this.serviceKey  = config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');
  }

  // ────────────────────────────────────────────────────────────────
  // GLOBAL USERS — every auth.users row across the platform
  // ────────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'List all auth.users with email/name/workspace count.' })
  async listUsers(@Query() q: ListUsersQueryDto) {
    const limit  = q.limit  ?? 50;
    const offset = q.offset ?? 0;
    const search = q.q ? `%${q.q.toLowerCase()}%` : null;

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        email: string | null;
        created_at: Date;
        last_sign_in_at: Date | null;
        banned_until: Date | null;
        workspace_count: bigint;
        roles: string[] | null;
        total_count: bigint;
      }>
    >(
      `SELECT u.id, u.email, u.created_at, u.last_sign_in_at, u.banned_until,
              -- Staff belong through workspace_members; clients belong
              -- through clients.user_id. Counting only the former showed every
              -- client as "0 workspaces" even while they were using the app.
              COALESCE((
                SELECT COUNT(DISTINCT ws)::bigint FROM (
                  SELECT m.workspace_id AS ws
                    FROM public.workspace_members m
                   WHERE m.user_id = u.id AND m.status = 'active'
                  UNION
                  SELECT c.workspace_id
                    FROM public.clients c
                    JOIN public.workspaces w2 ON w2.id = c.workspace_id AND w2.status <> 'deleted'
                   WHERE c.user_id = u.id
                ) _ws
              ), 0) AS workspace_count,
              COALESCE((
                SELECT ARRAY_AGG(role::text)
                  FROM public.user_roles ur WHERE ur.user_id = u.id
              ), ARRAY[]::text[]) AS roles,
              COUNT(*) OVER() AS total_count
         FROM auth.users u
        WHERE ($1::text IS NULL OR LOWER(COALESCE(u.email, '')) LIKE $1)
        ORDER BY u.created_at DESC
        LIMIT $2 OFFSET $3`,
      search, limit, offset,
    );

    return {
      data: {
        items: rows.map((r) => ({
          id: r.id,
          email: r.email,
          created_at: r.created_at,
          last_sign_in_at: r.last_sign_in_at,
          banned: r.banned_until !== null && r.banned_until > new Date(),
          banned_until: r.banned_until,
          workspace_count: Number(r.workspace_count),
          roles: r.roles ?? [],
        })),
        total: rows.length > 0 ? Number(rows[0].total_count) : 0,
        limit,
        offset,
      },
    };
  }

  @Post('users/:id/reset-password')
  @HttpCode(200)
  @Audit({ action: 'user.reset_password', resourceType: 'user', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Send a password recovery email to the user.' })
  async resetPassword(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.fetchSupabaseUser(id);
    if (!user.email) throw new BadRequestException('User has no email.');
    await this.callAdminApi(`/auth/v1/recover`, {
      method: 'POST',
      body: JSON.stringify({ email: user.email }),
    });
    return { data: { id, email: user.email, sent: true } };
  }

  @Post('users/:id/ban')
  @HttpCode(200)
  @Audit({ action: 'user.ban', resourceType: 'user', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Ban a user for 100 years (effectively forever) and sign them out everywhere.' })
  async ban(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    if (id === me.id) throw new BadRequestException("You can't ban yourself.");
    const [target] = await this.prisma.$queryRawUnsafe<Array<{ is_admin: boolean }>>(
      `SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = $1::uuid AND role::text = 'super_admin') AS is_admin`,
      id,
    );
    if (target?.is_admin) {
      throw new BadRequestException('That person is a super admin. Revoke their super admin access first, then ban.');
    }
    await this.callAdminApi(`/auth/v1/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ban_duration: '876000h' }), // ~100 years
    });
    await this.signOutEverywhere(id);
    return { data: { id, banned: true } };
  }

  @Post('users/:id/unban')
  @HttpCode(200)
  @Audit({ action: 'user.unban', resourceType: 'user', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Lift a user ban.' })
  async unban(@Param('id', ParseUUIDPipe) id: string) {
    await this.callAdminApi(`/auth/v1/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ban_duration: 'none' }),
    });
    return { data: { id, banned: false } };
  }

  // ────────────────────────────────────────────────────────────────
  // INTERNAL TEAM — super_admin role mgmt for Sirah Digital staff
  // ────────────────────────────────────────────────────────────────

  @Get('team')
  @ApiOperation({ summary: 'List all super_admins (Sirah Digital staff).' })
  async listTeam() {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; email: string | null; created_at: Date; granted_at: Date }>
    >(
      `SELECT u.id, u.email, u.created_at,
              -- user_roles has no timestamp, so this is when the account was created.
              u.created_at AS granted_at
         FROM auth.users u
         JOIN public.user_roles ur ON ur.user_id = u.id
        WHERE ur.role::text = 'super_admin'
        ORDER BY u.created_at ASC`,
    );
    return { data: { items: rows } };
  }

  @Post('team/invite')
  @HttpCode(200)
  @Audit({ action: 'super_admin.grant', resourceType: 'user' })
  @ApiOperation({
    summary: 'Provision a new Sirah Digital super_admin (creates auth user if needed, grants role).',
  })
  async invite(@Body() dto: InviteSuperAdminDto) {
    const email = dto.email.trim().toLowerCase();

    // 1. An existing account? Looked up in SQL — GoTrue's admin list has no exact-email filter.
    const [existing] = await this.prisma.$queryRawUnsafe<Array<{ id: string; role: string | null }>>(
      `SELECT u.id::text AS id, (SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = u.id LIMIT 1) AS role
         FROM auth.users u WHERE lower(u.email) = $1 LIMIT 1`,
      email,
    );

    let userId: string;
    let createdNow = false;
    if (existing) {
      if (existing.role === 'super_admin') return { data: { id: existing.id, email, granted: true } };
      // One role per account (user_roles.user_id is unique). Turning a
      // nutritionist's or client's login into a super admin would silently
      // change what that person can do, so it needs a separate email.
      if (existing.role) {
        throw new BadRequestException(
          `${email} already has a NUSI account (${existing.role}). Use a separate email for super admin access.`,
        );
      }
      userId = existing.id;
    } else {
      const created = (await this.callAdminApi('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email, password: dto.password, email_confirm: true }),
      })) as SupabaseAdminUser;
      userId = created.id;
      createdNow = true;
    }

    // 2. Grant the role. If that fails, don't leave a confirmed login with a known password behind.
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO public.user_roles (user_id, role) VALUES ($1::uuid, 'super_admin'::public.app_role)`,
        userId,
      );
    } catch (err) {
      if (createdNow) {
        await this.callAdminApi(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' }).catch((e) =>
          this.logger.error(`Could not remove orphaned admin login ${userId}: ${(e as Error).message}`),
        );
      }
      throw err;
    }

    // The JWT strategy caches the resolved AuthUser (roles included) for 120s;
    // drop it so the new super admin's next request sees the grant.
    await this.authCache.invalidate(userId);

    return { data: { id: userId, email, granted: true } };
  }

  @Post('team/:id/revoke')
  @HttpCode(200)
  @Audit({ action: 'super_admin.revoke', resourceType: 'user', resourceIdParam: 'id' })
  @ApiOperation({ summary: 'Revoke the super_admin role from a user (auth account preserved).' })
  async revoke(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    if (id === me.id) throw new BadRequestException("You can't revoke your own super admin access. Ask another super admin.");
    // Refuse to remove the last super admin. This existed only in the UI
    // (AdminTeam.tsx), so a direct API call could leave the platform with zero
    // super admins and no in-app way to appoint another — recoverable only by
    // hand-editing user_roles in SQL. Counted in the same statement that
    // deletes, so two concurrent revokes can't both see "2 remaining" and race
    // the platform down to none.
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ deleted: number; remaining: number }>>(
      `WITH before AS (
         SELECT count(*)::int AS n FROM public.user_roles WHERE role::text = 'super_admin'
       ), del AS (
         DELETE FROM public.user_roles
          WHERE user_id = $1 AND role::text = 'super_admin'
            AND (SELECT n FROM before) > 1
         RETURNING 1
       )
       SELECT (SELECT count(*)::int FROM del) AS deleted,
              (SELECT n FROM before) - (SELECT count(*)::int FROM del) AS remaining`,
      id,
    );

    if (!row || row.deleted === 0) {
      // Either they weren't a super admin, or they were the last one.
      if (row && row.remaining <= 1) {
        throw new BadRequestException(
          'Cannot revoke the last super admin - grant the role to someone else first.',
        );
      }
      throw new NotFoundException('That user is not a super admin.');
    }

    await this.authCache.invalidate(id);

    return { data: { id, revoked: true } };
  }

  // ────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────

  /**
   * End every session of a user now: delete their refresh sessions and forget
   * the cached identity. Access tokens they already hold are refused too,
   * because JwtStrategy rejects banned accounts.
   */
  private async signOutEverywhere(userId: string): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`DELETE FROM auth.sessions WHERE user_id = $1::uuid`, userId);
    } catch (err) {
      this.logger.warn(`Could not end sessions for ${userId}: ${(err as Error).message}`);
    }
    await this.authCache.invalidate(userId);
  }

  private async fetchSupabaseUser(id: string): Promise<SupabaseAdminUser> {
    return (await this.callAdminApi(`/auth/v1/admin/users/${id}`)) as SupabaseAdminUser;
  }

  private async callAdminApi(path: string, init: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${this.supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
        'Content-Type': 'application/json',
        ...((init.headers as Record<string, string>) ?? {}),
      },
    });
    const text = await res.text();
    let json: unknown;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    if (!res.ok) {
      const obj = json as { msg?: string; message?: string; error_description?: string };
      const msg = obj?.msg || obj?.message || obj?.error_description || text;
      throw new BadRequestException(`Supabase admin API ${res.status}: ${msg}`);
    }
    return json;
  }
}
