import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import {
  ClientInviteRow,
  ClientListItem,
  ClientMealLog,
  ClientMessage,
  ClientProfile,
  ClientProgram,
  InvitePreview,
} from './clients.types';

interface ListClientsParams {
  q?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // Workspace-admin side
  // ─────────────────────────────────────────────────────────────────

  async listClients(
    workspaceId: string,
    params: ListClientsParams = {},
  ): Promise<{ items: ClientListItem[]; total: number; limit: number; offset: number }> {
    const limit = clamp(params.limit ?? 50, 1, 200);
    const offset = Math.max(0, params.offset ?? 0);
    const where: string[] = [`workspace_id = $1::uuid`];
    const vals: unknown[] = [workspaceId];

    if (params.status) {
      vals.push(params.status);
      where.push(`status::text = $${vals.length}`);
    }
    if (params.q) {
      vals.push(`%${params.q.toLowerCase()}%`);
      where.push(`(LOWER(name) LIKE $${vals.length} OR LOWER(email) LIKE $${vals.length})`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const [countRow] = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*)::bigint AS n FROM public.clients ${whereSql}`,
      ...vals,
    );
    vals.push(limit);
    vals.push(offset);
    const items = await this.prisma.$queryRawUnsafe<ClientListItem[]>(
      `SELECT id, user_id, workspace_id, name, email, phone,
              status::text AS status, program_type::text AS program_type,
              target_kcal, last_weight::text, display_name,
              created_at, updated_at
         FROM public.clients
         ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
      ...vals,
    );
    return { items, total: Number(countRow?.n ?? 0n), limit, offset };
  }

  async listInvites(workspaceId: string): Promise<{ items: ClientInviteRow[] }> {
    const items = await this.prisma.$queryRawUnsafe<ClientInviteRow[]>(
      `SELECT * FROM public.client_invites
        WHERE workspace_id = $1::uuid
        ORDER BY created_at DESC`,
      workspaceId,
    );
    return { items };
  }

  async createInvite(
    workspaceId: string,
    invitedBy: string,
    email: string,
    name?: string,
    notes?: string,
  ): Promise<ClientInviteRow> {
    const normalized = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      throw new BadRequestException('Invalid email');
    }

    // Reject if an active client already exists with this email in the workspace.
    const existing = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients
        WHERE workspace_id = $1::uuid AND lower(email) = $2 AND status::text = 'active'
        LIMIT 1`,
      workspaceId,
      normalized,
    );
    if (existing.length) {
      throw new ConflictException('A client with this email is already active in your workspace');
    }

    const token = randomBytes(32).toString('hex');
    try {
      const rows = await this.prisma.$queryRawUnsafe<ClientInviteRow[]>(
        `INSERT INTO public.client_invites
           (workspace_id, email, name, token, invited_by, notes)
         VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6)
         RETURNING *`,
        workspaceId,
        normalized,
        name ?? null,
        token,
        invitedBy,
        notes ?? null,
      );
      return rows[0];
    } catch (err) {
      // Unique-partial-index collision → there's already a pending invite.
      if ((err as { code?: string }).code === 'P2010' || /duplicate key|unique/.test((err as Error).message)) {
        throw new ConflictException('A pending invite already exists for this email');
      }
      throw err;
    }
  }

  async revokeInvite(workspaceId: string, inviteId: string, actor: string): Promise<ClientInviteRow> {
    const rows = await this.prisma.$queryRawUnsafe<ClientInviteRow[]>(
      `UPDATE public.client_invites
          SET status = 'revoked',
              revoked_at = now(),
              revoked_by = $3::uuid
        WHERE id = $1::uuid AND workspace_id = $2::uuid AND status = 'pending'
       RETURNING *`,
      inviteId,
      workspaceId,
      actor,
    );
    if (!rows.length) throw new NotFoundException('Invite not found or already finalised');
    return rows[0];
  }

  // ─────────────────────────────────────────────────────────────────
  // Invite preview + accept (public-ish)
  // ─────────────────────────────────────────────────────────────────

  async previewInvite(token: string): Promise<InvitePreview> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        workspace_id: string;
        workspace_name: string;
        workspace_slug: string | null;
        inviter_email: string | null;
        email: string;
        expires_at: string;
        status: string;
      }>
    >(
      `SELECT ci.id, ci.workspace_id, w.name AS workspace_name, w.slug AS workspace_slug,
              u.email AS inviter_email, ci.email, ci.expires_at, ci.status
         FROM public.client_invites ci
         JOIN public.workspaces w ON w.id = ci.workspace_id
         LEFT JOIN auth.users u   ON u.id = ci.invited_by
        WHERE ci.token = $1
        LIMIT 1`,
      token,
    );
    if (!rows.length) throw new NotFoundException('Invite not found');
    const r = rows[0];
    const isExpired = new Date(r.expires_at).getTime() < Date.now();
    return {
      id: r.id,
      workspace_name: r.workspace_name,
      workspace_slug: r.workspace_slug,
      inviter_email: r.inviter_email,
      email: r.email,
      expires_at: r.expires_at,
      status: r.status as InvitePreview['status'],
      is_expired: isExpired,
    };
  }

  /**
   * Accept an invite. Caller must be authenticated. Effects:
   *   1. Verify token is pending + not expired + email matches caller.
   *   2. Insert (or update) clients row scoped to this workspace.
   *   3. Insert user_roles(client) if not already present.
   *   4. Mark invite accepted.
   */
  async acceptInvite(token: string, callerId: string, callerEmail: string | undefined): Promise<{ workspaceId: string; clientId: string }> {
    const [invite] = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        workspace_id: string;
        email: string;
        name: string | null;
        status: string;
        expires_at: string;
      }>
    >(
      `SELECT id, workspace_id, email, name, status, expires_at
         FROM public.client_invites WHERE token = $1 LIMIT 1`,
      token,
    );
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status !== 'pending') {
      throw new ForbiddenException(`Invite ${invite.status}`);
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      // Mark expired so the row reflects the fact, but reject.
      await this.prisma.$queryRawUnsafe(
        `UPDATE public.client_invites SET status='expired' WHERE id = $1::uuid`,
        invite.id,
      );
      throw new ForbiddenException('Invite expired');
    }
    if (callerEmail && callerEmail.toLowerCase() !== invite.email.toLowerCase()) {
      throw new ForbiddenException('This invite was issued for a different email address');
    }

    // 2. clients row — INSERT or relink existing one to this workspace.
    const [client] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO public.clients
         (user_id, workspace_id, name, email, phone, status)
       VALUES ($1::uuid, $2::uuid, $3, $4, '', 'active')
       ON CONFLICT (user_id) DO UPDATE
         SET workspace_id = EXCLUDED.workspace_id,
             status       = 'active',
             updated_at   = now()
       RETURNING id`,
      callerId,
      invite.workspace_id,
      invite.name ?? invite.email.split('@')[0],
      invite.email,
    );

    // 3. user_roles += client (ignore if super_admin/workspace already set)
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.user_roles (user_id, role)
       VALUES ($1::uuid, 'client'::app_role)
       ON CONFLICT (user_id, role) DO NOTHING`,
      callerId,
    );

    // 4. Mark invite accepted.
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.client_invites
          SET status = 'accepted', accepted_at = now(), accepted_user_id = $2::uuid
        WHERE id = $1::uuid`,
      invite.id,
      callerId,
    );

    return { workspaceId: invite.workspace_id, clientId: client.id };
  }

  // ─────────────────────────────────────────────────────────────────
  // Client-side reads (caller must be a client)
  // ─────────────────────────────────────────────────────────────────

  async myProfile(userId: string): Promise<ClientProfile> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        user_id: string;
        workspace_id: string;
        workspace_name: string | null;
        name: string;
        email: string;
        phone: string | null;
        age: number | null;
        gender: string | null;
        goals: string | null;
        target_kcal: number | null;
        program_type: string | null;
        status: string | null;
      }>
    >(
      `SELECT c.id, c.user_id, c.workspace_id,
              w.name AS workspace_name,
              c.name, c.email, c.phone, c.age, c.gender::text AS gender,
              c.goals, c.target_kcal, c.program_type::text AS program_type,
              c.status::text AS status
         FROM public.clients c
         LEFT JOIN public.workspaces w ON w.id = c.workspace_id
        WHERE c.user_id = $1::uuid
        LIMIT 1`,
      userId,
    );
    if (!rows.length) throw new NotFoundException('No client profile linked to this user');
    return rows[0];
  }

  async myMeals(userId: string, days = 7): Promise<ClientMealLog[]> {
    const d = clamp(days, 1, 90);
    const rows = await this.prisma.$queryRawUnsafe<ClientMealLog[]>(
      `SELECT m.id, m.meal_type::text AS meal_type, m.meal_name,
              m.kcal, m.photo_url, m.notes, m.logged_at
         FROM public.meal_logs m
         JOIN public.clients c ON c.id = m.client_id
        WHERE c.user_id = $1::uuid
          AND m.logged_at >= now() - ($2 || ' days')::interval
        ORDER BY m.logged_at DESC
        LIMIT 200`,
      userId,
      String(d),
    );
    return rows;
  }

  async myMessages(userId: string, limit = 50): Promise<ClientMessage[]> {
    const lim = clamp(limit, 1, 200);
    const rows = await this.prisma.$queryRawUnsafe<ClientMessage[]>(
      `SELECT m.id, m.sender_type, m.message_type, m.content, m.is_read, m.created_at
         FROM public.messages m
         JOIN public.clients c ON c.id = m.client_id
        WHERE c.user_id = $1::uuid
        ORDER BY m.created_at DESC
        LIMIT $2`,
      userId,
      lim,
    );
    return rows;
  }

  async myProgram(userId: string): Promise<ClientProgram | null> {
    const rows = await this.prisma.$queryRawUnsafe<ClientProgram[]>(
      `SELECT wp.id, wp.week_number, wp.start_date::text AS start_date,
              wp.end_date::text AS end_date, wp.total_kcal, wp.status, wp.published_at
         FROM public.weekly_plans wp
         JOIN public.clients c ON c.id = wp.client_id
        WHERE c.user_id = $1::uuid
          AND wp.published_at IS NOT NULL
        ORDER BY wp.start_date DESC
        LIMIT 1`,
      userId,
    );
    return rows[0] ?? null;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}