import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'node:crypto';
import { importPKCS8, SignJWT } from 'jose';
import { PrismaService } from '../database/prisma.service';
import { buildAssessmentContent, buildAssessmentReport, type AssessmentType, type TemplateQuestion } from './assessment-templates';
import { STARTER_FORMS, starterFormByKey } from './starter-forms';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { LimitsService } from '../tenancy/limits.service';
import { UsageService } from '../usage/usage.service';
import { WorkspaceRecipesService } from '../workspace-recipes/workspace-recipes.service';
import { PushService } from './push.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ClientListItem,
  ClientMealLog,
  ClientMessage,
  ClientProfile,
  ClientProgram,
  JoinLinkInfo,
  JoinPreview,
  JoinRequestRow,
  JoinRequestStatus,
  MessageMetadata,
  PreapprovalRow,
} from './clients.types';

/**
 * Tables whose FK to clients is ON DELETE NO ACTION — Postgres will refuse to
 * delete a client while any of these rows exist, so deleteClient clears them
 * first. Every one of them keys on `client_id`. This list is hardcoded (never
 * caller-supplied) because it is interpolated straight into the statement.
 *
 * If a new table gets a NO ACTION FK to clients, deletes start failing with a
 * foreign-key error until it's added here.
 */
const CLIENT_BLOCKING_TABLES = [
  'action_plans',
  'calendar_events',
  'client_workflow_state',
  'diet_preferences',
  'follow_ups',
  'meal_compliance',
  'workflow_history',
] as const;

interface ListClientsParams {
  q?: string;
  status?: string;
  limit?: number;
  offset?: number;
  /** When set, restrict to clients assigned to this coach (role-scoped reads). */
  assignedCoachUserId?: string;
}

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly push: PushService,
    private readonly config: ConfigService,
    private readonly limits: LimitsService,
    private readonly usage: UsageService,
    private readonly workspaceRecipes: WorkspaceRecipesService,
    private readonly notifications: NotificationsService,
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
    if (params.assignedCoachUserId) {
      vals.push(params.assignedCoachUserId);
      where.push(`assigned_coach_user_id = $${vals.length}::uuid`);
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
              target_kcal, last_weight::text, display_name, avatar_url, last_active_at,
              assigned_coach_user_id, created_at, updated_at,
              ap.program_name AS assigned_program,
              ap.program_start::text AS assigned_program_start,
              ap.program_weeks AS assigned_program_weeks,
              ap.program_unit AS assigned_program_unit
         FROM public.clients
         LEFT JOIN LATERAL (
           SELECT pa.name AS program_name, pa.start_date AS program_start,
                  pa.duration_weeks AS program_weeks, pa.duration_unit::text AS program_unit
             FROM public.program_assignments pa
            WHERE pa.client_id = clients.id AND pa.status = 'active'
            ORDER BY pa.start_date DESC NULLS LAST
            LIMIT 1
         ) ap ON true
         ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
      ...vals,
    );
    return { items, total: Number(countRow?.n ?? 0n), limit, offset };
  }

  /** Staff who can own a caseload (coaches) — for the assignment picker. */
  async listAssignableCoaches(
    workspaceId: string,
  ): Promise<Array<{ user_id: string; name: string; email: string | null; role: string }>> {
    return this.prisma.$queryRawUnsafe(
      `SELECT m.user_id,
              COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)) AS name,
              u.email AS email,
              m.role::text AS role
         FROM public.workspace_members m
         JOIN auth.users u ON u.id = m.user_id
        WHERE m.workspace_id = $1::uuid
          AND m.status = 'active'
          AND m.role::text IN ('coach', 'nutritionist')
        ORDER BY name ASC`,
      workspaceId,
    );
  }

  /** Set (or clear) the coach assigned to a client. Validates membership. */
  async assignCoach(
    workspaceId: string,
    clientId: string,
    coachUserId: string | null,
  ): Promise<{ id: string; assigned_coach_user_id: string | null }> {
    if (coachUserId) {
      const member = await this.prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
        `SELECT user_id FROM public.workspace_members
          WHERE workspace_id = $1::uuid AND user_id = $2::uuid AND status = 'active'`,
        workspaceId,
        coachUserId,
      );
      if (member.length === 0) {
        throw new BadRequestException('That coach is not a member of this workspace.');
      }
    }
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; assigned_coach_user_id: string | null }>>(
      `UPDATE public.clients
          SET assigned_coach_user_id = $3::uuid, updated_at = now()
        WHERE id = $1::uuid AND workspace_id = $2::uuid
      RETURNING id, assigned_coach_user_id`,
      clientId,
      workspaceId,
      coachUserId,
    );
    if (rows.length === 0) throw new NotFoundException('Client not found.');
    return rows[0];
  }

  /**
   * Permanently delete a client and everything they own. IRREVERSIBLE.
   *
   * 39 tables cascade from clients.id (meals, messages, assessments, photos,
   * journal, programs…), so this genuinely destroys their history. Seven more
   * reference clients with ON DELETE NO ACTION and would abort the delete
   * mid-way, so they are cleared explicitly first — see CLIENT_BLOCKING_TABLES.
   *
   * The whole thing runs in one transaction: a partial delete would leave a
   * half-erased client whose rows still point at a row that no longer exists.
   *
   * The auth user itself is intentionally left alone — we own workspace data,
   * not the person's account. Their 'client' role is dropped so a stale login
   * doesn't land in a portal with no client row behind it.
   */
  async purgeClient(workspaceId: string, clientId: string, actor: string): Promise<{ deleted: true; name: string | null }> {
    const [client] = await this.prisma.$queryRawUnsafe<Array<{ id: string; user_id: string; name: string }>>(
      `SELECT id, user_id, name FROM public.clients
        WHERE id = $1::uuid AND workspace_id = $2::uuid
        LIMIT 1`,
      clientId,
      workspaceId,
    );
    if (!client) throw new NotFoundException('Client not found');

    await this.prisma.$transaction(async (tx) => {
      for (const table of CLIENT_BLOCKING_TABLES) {
        await tx.$executeRawUnsafe(
          `DELETE FROM public.${table} WHERE client_id = $1::uuid`,
          clientId,
        );
      }
      // Their join history for this workspace, so a later re-request is clean.
      await tx.$executeRawUnsafe(
        `DELETE FROM public.client_join_requests
          WHERE user_id = $1::uuid AND workspace_id = $2::uuid`,
        client.user_id,
        workspaceId,
      );
      await tx.$executeRawUnsafe(`DELETE FROM public.clients WHERE id = $1::uuid`, clientId);
      await tx.$executeRawUnsafe(
        `DELETE FROM public.user_roles WHERE user_id = $1::uuid AND role = 'client'::app_role`,
        client.user_id,
      );
    });

    this.logger.warn(
      `Client permanently deleted: ${client.name} (${clientId}) from workspace ${workspaceId} by user ${actor}`,
    );
    return { deleted: true as const, name: client.name as string | null };
  }

  /**
   * Counts for the owner sidebar badges — one round-trip. Each is a genuine
   * "needs your attention" quantity, not a total: unread client messages,
   * pending join requests, today's scheduled appointments, and the caller's
   * unread notifications. Sections without a reliable unattended-count source
   * (team chat has no read state) are intentionally absent.
   */
  async sidebarBadges(
    workspaceId: string,
    userId: string,
  ): Promise<{ messaging: number; clients: number; appointments: number; notifications: number }> {
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{ messaging: number; clients: number; appointments: number }>
    >(
      `SELECT
         (SELECT COUNT(*) FROM public.messages m
            JOIN public.clients c ON c.id = m.client_id
           WHERE c.workspace_id = $1::uuid
             AND m.is_read = false AND m.sender_type <> 'admin')::int AS messaging,
         (SELECT COUNT(*) FROM public.client_join_requests
           WHERE workspace_id = $1::uuid AND status = 'pending')::int AS clients,
         (SELECT COUNT(*) FROM public.appointments
           WHERE workspace_id = $1::uuid AND status = 'scheduled'
             AND scheduled_at::date = CURRENT_DATE)::int AS appointments`,
      workspaceId,
    );
    // Notifications are user-scoped and live in a different service; a failure
    // there must not blank the whole badge set.
    const notifications = await this.notifications.unreadCountForUser(userId).catch(() => 0);
    return {
      messaging: row?.messaging ?? 0,
      clients: row?.clients ?? 0,
      appointments: row?.appointments ?? 0,
      notifications,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Join link — one shareable, expiring link per workspace
  // ─────────────────────────────────────────────────────────────────

  private joinUrl(token: string | null): string | null {
    if (!token) return null;
    const origin = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:4000').split(',')[0].trim();
    return `${origin}/join/${token}`;
  }

  private toJoinLinkInfo(token: string | null, expiresAt: string | null): JoinLinkInfo {
    return {
      token,
      url: this.joinUrl(token),
      expires_at: expiresAt,
      is_expired: !!expiresAt && new Date(expiresAt).getTime() < Date.now(),
    };
  }

  /** Current link for this workspace. token is null until first generated. */
  async getJoinLink(workspaceId: string): Promise<JoinLinkInfo> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ token: string | null; expires_at: string | null }>>(
      `SELECT join_token AS token, join_token_expires_at AS expires_at
         FROM public.workspaces WHERE id = $1::uuid`,
      workspaceId,
    );
    if (!row) throw new NotFoundException('Workspace not found');
    return this.toJoinLinkInfo(row.token, row.expires_at);
  }

  /**
   * Issue a fresh link, invalidating the previous one immediately (the token
   * column is overwritten). That is the whole point of rotation: a leaked link
   * must die the moment the owner asks for a new one.
   */
  async rotateJoinLink(workspaceId: string, actor: string, ttlDays?: number): Promise<JoinLinkInfo> {
    const days = clamp(ttlDays ?? 30, 1, 365);
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ token: string | null; expires_at: string | null }>>(
      `UPDATE public.workspaces
          SET join_token            = $2,
              join_token_expires_at = now() + make_interval(days => $3::int),
              join_token_created_by = $4::uuid,
              join_token_created_at = now()
        WHERE id = $1::uuid
      RETURNING join_token AS token, join_token_expires_at AS expires_at`,
      workspaceId,
      randomBytes(32).toString('hex'),
      days,
      actor,
    );
    if (!row) throw new NotFoundException('Workspace not found');
    return this.toJoinLinkInfo(row.token, row.expires_at);
  }

  /** Kill the link without issuing a new one. */
  async disableJoinLink(workspaceId: string): Promise<JoinLinkInfo> {
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.workspaces
          SET join_token = NULL, join_token_expires_at = NULL
        WHERE id = $1::uuid`,
      workspaceId,
    );
    return this.toJoinLinkInfo(null, null);
  }

  // ─────────────────────────────────────────────────────────────────
  // Join requests (owner side)
  // ─────────────────────────────────────────────────────────────────

  async listJoinRequests(workspaceId: string, status?: JoinRequestStatus): Promise<{ items: JoinRequestRow[] }> {
    const items = await this.prisma.$queryRawUnsafe<JoinRequestRow[]>(
      `SELECT * FROM public.client_join_requests
        WHERE workspace_id = $1::uuid
          AND ($2::text IS NULL OR status = $2::text)
        ORDER BY created_at DESC`,
      workspaceId,
      status ?? null,
    );
    return { items };
  }

  /**
   * Approve a pending request → the client goes live. The plan-limit check
   * lives HERE rather than at request time on purpose: a queue of unapproved
   * strangers must never consume the owner's paid seats, and anyone holding
   * the link can queue up.
   */
  async approveJoinRequest(workspaceId: string, requestId: string, actor: string): Promise<JoinRequestRow> {
    const [req] = await this.prisma.$queryRawUnsafe<JoinRequestRow[]>(
      `SELECT * FROM public.client_join_requests
        WHERE id = $1::uuid AND workspace_id = $2::uuid AND status = 'pending'
        LIMIT 1`,
      requestId,
      workspaceId,
    );
    if (!req) throw new NotFoundException('Request not found or already decided');

    await this.limits.assertCanAddClient(workspaceId);

    // The clients row was created at request time (status 'pending'); flip it
    // live. Re-assert workspace_id so a stale row from a previous workspace
    // can't leave them pointing somewhere else.
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.clients
          SET status = 'active', workspace_id = $2::uuid, updated_at = now()
        WHERE user_id = $1::uuid`,
      req.user_id,
      workspaceId,
    );

    const [row] = await this.prisma.$queryRawUnsafe<JoinRequestRow[]>(
      `UPDATE public.client_join_requests
          SET status = 'approved', decided_by = $2::uuid, decided_at = now()
        WHERE id = $1::uuid
      RETURNING *`,
      requestId,
      actor,
    );

    void this.notifications.notifyUser(workspaceId, req.user_id, {
      type: 'join:approved',
      title: "🎉 You're in",
      body: 'Your nutritionist approved your request. Tap to set up your profile.',
      url: '/portal/onboarding',
      tag: `join-${req.id}`,
    });

    return row;
  }

  /**
   * Reject a pending request. We keep the clients row (as 'inactive') rather
   * than deleting it: deleting would strip their client role and dump them on
   * the owner-onboarding wizard, which is worse than a clear "not approved".
   */
  async rejectJoinRequest(workspaceId: string, requestId: string, actor: string, note?: string): Promise<JoinRequestRow> {
    const [req] = await this.prisma.$queryRawUnsafe<JoinRequestRow[]>(
      `SELECT * FROM public.client_join_requests
        WHERE id = $1::uuid AND workspace_id = $2::uuid AND status = 'pending'
        LIMIT 1`,
      requestId,
      workspaceId,
    );
    if (!req) throw new NotFoundException('Request not found or already decided');

    await this.prisma.$queryRawUnsafe(
      `UPDATE public.clients
          SET status = 'inactive', updated_at = now()
        WHERE user_id = $1::uuid AND workspace_id = $2::uuid`,
      req.user_id,
      workspaceId,
    );

    const [row] = await this.prisma.$queryRawUnsafe<JoinRequestRow[]>(
      `UPDATE public.client_join_requests
          SET status = 'rejected', decided_by = $2::uuid, decided_at = now(), note = COALESCE($3, note)
        WHERE id = $1::uuid
      RETURNING *`,
      requestId,
      actor,
      note ?? null,
    );
    return row;
  }

  // ─────────────────────────────────────────────────────────────────
  // Pre-approvals — the CSV import target
  // ─────────────────────────────────────────────────────────────────

  /**
   * Bulk-import expected clients from a spreadsheet. These are NOT clients
   * yet (clients.user_id is NOT NULL and these people have no auth account);
   * they are a list of emails that skip the approval queue when they sign up
   * via the join link. Idempotent — re-running the same CSV updates in place.
   */
  async importClients(
    workspaceId: string,
    addedBy: string,
    rows: Array<{ email: string; name?: string; phone?: string }>,
  ): Promise<{ total: number; created: number; skipped: Array<{ email: string; reason: string }> }> {
    const capped = rows.slice(0, 500);
    let created = 0;
    const skipped: Array<{ email: string; reason: string }> = [];
    for (const r of capped) {
      const email = (r.email ?? '').trim().toLowerCase();
      if (!email) {
        skipped.push({ email: r.email || '(blank)', reason: 'Missing email' });
        continue;
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        skipped.push({ email, reason: 'Invalid email' });
        continue;
      }
      try {
        const [existing] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM public.clients
            WHERE workspace_id = $1::uuid AND lower(email) = $2 AND status::text = 'active'
            LIMIT 1`,
          workspaceId,
          email,
        );
        if (existing) {
          skipped.push({ email, reason: 'Already an active client' });
          continue;
        }
        await this.prisma.$queryRawUnsafe(
          `INSERT INTO public.client_preapprovals
             (workspace_id, email, name, phone, added_by)
           VALUES ($1::uuid, $2, $3, $4, $5::uuid)
           ON CONFLICT (workspace_id, lower(email)) DO UPDATE
             SET name = COALESCE(EXCLUDED.name, public.client_preapprovals.name),
                 phone = COALESCE(EXCLUDED.phone, public.client_preapprovals.phone),
                 updated_at = now()`,
          workspaceId,
          email,
          r.name?.trim() || null,
          r.phone?.trim() || null,
          addedBy,
        );
        created++;
      } catch (err) {
        skipped.push({ email, reason: (err as Error).message || 'Could not import' });
      }
    }
    return { total: capped.length, created, skipped };
  }

  /** Imported-but-not-yet-signed-up people, for the roster's pending rows. */
  async listPreapprovals(workspaceId: string): Promise<{ items: PreapprovalRow[] }> {
    const items = await this.prisma.$queryRawUnsafe<PreapprovalRow[]>(
      `SELECT id, workspace_id, email, name, phone, note, consumed_at, created_at
         FROM public.client_preapprovals
        WHERE workspace_id = $1::uuid AND consumed_at IS NULL
        ORDER BY created_at DESC`,
      workspaceId,
    );
    return { items };
  }

  async removePreapproval(workspaceId: string, id: string): Promise<{ deleted: true }> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `DELETE FROM public.client_preapprovals
        WHERE id = $1::uuid AND workspace_id = $2::uuid AND consumed_at IS NULL
      RETURNING id`,
      id,
      workspaceId,
    );
    if (!rows.length) throw new NotFoundException('Not found');
    return { deleted: true };
  }

  // ─────────────────────────────────────────────────────────────────
  // Join link preview + request (public-ish)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Resolve a join token to its workspace, or throw. Shared by preview (no
   * auth) and request (auth) so both enforce expiry identically — an expired
   * link must not be usable just because the caller skipped the preview.
   */
  private async workspaceForJoinToken(token: string): Promise<{
    id: string;
    name: string;
    slug: string | null;
  }> {
    const [ws] = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; name: string; slug: string | null; expires_at: string | null }>
    >(
      `SELECT id, name, slug, join_token_expires_at AS expires_at
         FROM public.workspaces
        WHERE join_token = $1
        LIMIT 1`,
      token,
    );
    if (!ws) throw new NotFoundException('This link is not valid');
    if (!ws.expires_at || new Date(ws.expires_at).getTime() < Date.now()) {
      throw new ForbiddenException('This link has expired - ask your nutritionist for a new one');
    }
    return { id: ws.id, name: ws.name, slug: ws.slug };
  }

  async previewJoin(token: string): Promise<JoinPreview> {
    const ws = await this.workspaceForJoinToken(token);
    return { workspace_name: ws.name, workspace_slug: ws.slug };
  }

  /**
   * Request to join a workspace via its link. Caller must be authenticated —
   * they sign up on the /join page first, so we have a real auth user to hang
   * the clients row off. Effects:
   *   1. Resolve + validate the token (expiry).
   *   2. clients row at 'pending' (or 'active' if pre-approved by import).
   *   3. user_roles += 'client' so they can reach the portal and see the
   *      waiting screen rather than being bounced to owner-onboarding.
   *   4. client_join_requests row; owner gets a bell.
   *
   * NOTE clients.user_id is globally UNIQUE — one client row per auth user.
   * Joining a second workspace therefore MOVES the person, matching what the
   * old invite-accept did.
   */
  async requestJoin(
    token: string,
    callerId: string,
    callerEmail: string | undefined,
    name?: string,
  ): Promise<{ status: 'pending' | 'active'; workspaceId: string; clientId: string }> {
    const ws = await this.workspaceForJoinToken(token);

    const email = (callerEmail ?? '').trim().toLowerCase();
    if (!email) throw new BadRequestException('Your account has no email address');

    // Already an active client here? Nothing to request.
    const [already] = await this.prisma.$queryRawUnsafe<Array<{ id: string; status: string }>>(
      `SELECT id, status::text AS status FROM public.clients
        WHERE user_id = $1::uuid AND workspace_id = $2::uuid
        LIMIT 1`,
      callerId,
      ws.id,
    );
    if (already?.status === 'active') {
      return { status: 'active', workspaceId: ws.id, clientId: already.id };
    }

    // Imported by the owner ahead of time → skip the queue.
    const [pre] = await this.prisma.$queryRawUnsafe<Array<{ id: string; name: string | null; phone: string | null }>>(
      `SELECT id, name, phone FROM public.client_preapprovals
        WHERE workspace_id = $1::uuid AND lower(email) = $2 AND consumed_at IS NULL
        LIMIT 1`,
      ws.id,
      email,
    );
    const autoApprove = !!pre;
    if (autoApprove) await this.limits.assertCanAddClient(ws.id);

    const displayName = name?.trim() || pre?.name || email.split('@')[0];

    const [client] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO public.clients
         (user_id, workspace_id, name, email, phone, status)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::client_status)
       ON CONFLICT (user_id) DO UPDATE
         SET workspace_id = EXCLUDED.workspace_id,
             name         = EXCLUDED.name,
             status       = EXCLUDED.status,
             updated_at   = now()
       RETURNING id`,
      callerId,
      ws.id,
      displayName,
      email,
      pre?.phone ?? '',
      autoApprove ? 'active' : 'pending',
    );

    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.user_roles (user_id, role)
       VALUES ($1::uuid, 'client'::app_role)
       ON CONFLICT (user_id, role) DO NOTHING`,
      callerId,
    );

    if (autoApprove) {
      await this.prisma.$queryRawUnsafe(
        `UPDATE public.client_preapprovals
            SET consumed_at = now(), consumed_user_id = $2::uuid
          WHERE id = $1::uuid`,
        pre!.id,
        callerId,
      );
      // Audit trail: record the auto-decision rather than leaving a gap.
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO public.client_join_requests
           (workspace_id, user_id, email, name, status, decided_at, note)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'approved', now(), 'Auto-approved: pre-imported email')`,
        ws.id,
        callerId,
        email,
        displayName,
      );
      return { status: 'active', workspaceId: ws.id, clientId: client.id };
    }

    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.client_join_requests
         (workspace_id, user_id, email, name)
       VALUES ($1::uuid, $2::uuid, $3, $4)
       ON CONFLICT (workspace_id, user_id) WHERE status = 'pending' DO NOTHING`,
      ws.id,
      callerId,
      email,
      displayName,
    );

    void this.notifications.notifyStaff(ws.id, {
      type: 'join:requested',
      title: '👋 New client request',
      body: `${displayName} (${email}) wants to join ${ws.name}.`,
      url: '/clients',
      tag: `join-req-${callerId}`,
    });

    return { status: 'pending', workspaceId: ws.id, clientId: client.id };
  }

  /** Latest join request for the caller — powers the client waiting screen. */
  async myJoinRequest(userId: string): Promise<JoinRequestRow | null> {
    const [row] = await this.prisma.$queryRawUnsafe<JoinRequestRow[]>(
      `SELECT * FROM public.client_join_requests
        WHERE user_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT 1`,
      userId,
    );
    return row ?? null;
  }

  // ─────────────────────────────────────────────────────────────────
  // Client-side reads (caller must be a client)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Aggregate for the client Home page — runs the independent reads in parallel
   * and returns them in one payload, so the dashboard makes ONE round-trip to
   * the (remote Tokyo) DB instead of ~6. Each piece degrades to null on its own
   * error (e.g. a client with no record, or a transient blip) so a single
   * failure never blanks the whole page. Meals are fetched separately by the
   * page — that endpoint is feature-gated on `calorie_counting`.
   */
  async myHome(userId: string) {
    const ok = <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);
    const [profile, snapshot, program, messages, mood, assessments] = await Promise.all([
      ok(this.myProfile(userId)),
      ok(this.myWellnessSnapshot(userId)),
      ok(this.myProgram(userId)),
      ok(this.myMessages(userId, 30)),
      ok(this.myMoodHistory(userId, 1)),
      ok(this.myAssessmentCards(userId)),
    ]);
    return { profile, snapshot, program, messages, mood, assessments };
  }

  async myProfile(userId: string): Promise<ClientProfile> {
    const rows = await this.prisma.$queryRawUnsafe<ClientProfile[]>(
      `SELECT c.id, c.user_id, c.workspace_id,
              w.name AS workspace_name,
              c.name, c.email, c.phone, c.age, c.gender::text AS gender,
              c.height_cm, c.last_weight::float AS weight_kg,
              c.goals, c.target_kcal, c.program_type::text AS program_type,
              c.activity_level, c.allergies, c.medical_conditions, c.food_preferences,
              c.status::text AS status, c.avatar_url, c.last_active_at,
              c.onboarded_at, c.banner_quotes, c.community_accepted_at
         FROM public.clients c
         LEFT JOIN public.workspaces w ON w.id = c.workspace_id
        WHERE c.user_id = $1::uuid
        LIMIT 1`,
      userId,
    );
    if (!rows.length) throw new NotFoundException('No client profile linked to this user');
    return rows[0];
  }

  /** Replace the client's banner quotes (sanitised: trimmed, deduped, capped). */
  async setMyBannerQuotes(userId: string, quotes: string[]): Promise<{ banner_quotes: string[] }> {
    const me = await this.myClientId(userId);
    const clean = (Array.isArray(quotes) ? quotes : [])
      .map((q) => String(q ?? '').trim())
      .filter((q) => q.length > 0)
      .map((q) => q.slice(0, 200))
      .slice(0, 20);
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.clients SET banner_quotes = $1::jsonb, updated_at = now() WHERE id = $2::uuid`,
      JSON.stringify(clean),
      me,
    );
    return { banner_quotes: clean };
  }

  /**
   * Mark the community guidelines accepted. Idempotent — keeps the first
   * acceptance timestamp so re-calling never resets it. The client portal
   * uses this to gate the community feed behind a one-time welcome screen.
   */
  async acceptCommunity(userId: string): Promise<{ community_accepted_at: string }> {
    const me = await this.myClientId(userId);
    const rows = await this.prisma.$queryRawUnsafe<{ community_accepted_at: Date }[]>(
      `UPDATE public.clients
          SET community_accepted_at = COALESCE(community_accepted_at, now()),
              updated_at = now()
        WHERE id = $1::uuid
        RETURNING community_accepted_at`,
      me,
    );
    return { community_accepted_at: rows[0].community_accepted_at.toISOString() };
  }

  /**
   * Mark the post-invite onboarding wizard complete and persist the
   * profile fields the wizard collected in one atomic call. The frontend
   * uses `onboarded_at` to decide whether to gate /portal/* behind the
   * wizard — so we set it last, after the profile UPDATE succeeds.
   */
  async completeOnboarding(
    userId: string,
    body: Partial<{
      age: number;
      gender: string;
      goals: string;
      phone: string;
      allergies: string;
      medical_conditions: string;
      food_preferences: string;
      activity_level: string;
      height_cm: number;
    }> & { initial_weight_kg?: number },
  ): Promise<ClientProfile> {
    const [me] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!me) throw new NotFoundException('No client profile linked to this user');

    // Patch any wellness fields the wizard collected.
    await this.updateMyProfile(userId, {
      age: body.age,
      gender: body.gender,
      goals: body.goals,
      phone: body.phone,
      allergies: body.allergies,
      medical_conditions: body.medical_conditions,
      food_preferences: body.food_preferences,
      activity_level: body.activity_level,
      height_cm: body.height_cm,
    });

    // Capture initial weight as today's habit row (if provided).
    if (body.initial_weight_kg && body.initial_weight_kg > 0) {
      await this.upsertHabit(userId, { weight_kg: body.initial_weight_kg });
    }

    // Flip the gate.
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.clients
          SET onboarded_at = COALESCE(onboarded_at, now()),
              updated_at   = now()
        WHERE id = $1::uuid`,
      me.id,
    );
    return this.myProfile(userId);
  }

  async myMeals(userId: string, days = 7): Promise<ClientMealLog[]> {
    const d = clamp(days, 1, 90);
    const rows = await this.prisma.$queryRawUnsafe<ClientMealLog[]>(
      `SELECT m.id, m.meal_type::text AS meal_type, m.meal_name,
              m.kcal, m.photo_url, m.notes, m.logged_at
         FROM public.meal_logs m
         JOIN public.clients c ON c.id = m.client_id
        WHERE c.user_id = $1::uuid
          AND m.plate_group_id IS NULL  -- plate items surface via /me/plates (grouped)
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
      `SELECT m.id, m.sender_type, m.message_type, m.content, m.is_read, m.created_at,
              m.metadata, m.attachment_url, m.attachment_name, m.attachment_type, m.attachment_size
         FROM public.messages m
         JOIN public.clients c ON c.id = m.client_id
        WHERE c.user_id = $1::uuid
          AND COALESCE(m.metadata->>'status', '') <> 'scheduled'
          AND COALESCE(m.metadata->>'hidden_client', '') <> 'true'
        ORDER BY m.created_at DESC
        LIMIT $2`,
      userId,
      lim,
    );
    return rows;
  }

  /** The nutritionist/practice profile shown to the client (name, logo, tagline). */
  async myNutritionist(userId: string): Promise<{ name: string; logo_url: string | null; tagline: string | null }> {
    const fallback = { name: 'Your nutritionist', logo_url: null, tagline: null };
    const [c] = await this.prisma.$queryRawUnsafe<Array<{ workspace_id: string }>>(
      `SELECT workspace_id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`, userId);
    if (!c?.workspace_id) return fallback;
    const [w] = await this.prisma.$queryRawUnsafe<Array<{ name: string; display_name: string | null; logo_url: string | null; tagline: string | null }>>(
      `SELECT name, display_name, logo_url, tagline FROM public.workspaces WHERE id = $1::uuid LIMIT 1`, c.workspace_id);
    if (!w) return fallback;
    return { name: w.display_name || w.name || 'Your nutritionist', logo_url: w.logo_url, tagline: w.tagline };
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

  // ─────────────────────────────────────────────────────────────────
  // Wellness snapshot — single dashboard hero call
  //
  // Aggregates today's daily_log + meal_logs + the client's streak into
  // one shape the Home page can render without N round-trips.
  // ─────────────────────────────────────────────────────────────────

  async myWellnessSnapshot(userId: string): Promise<{
    score: number;
    scoreLabel: string;
    garden: ReturnType<typeof gardenState>;
    streakDays: number;
    todayKcal: number;
    targetKcal: number | null;
    waterMl: number;
    waterTargetMl: number;
    sleepHours: number | null;
    exerciseMinutes: number;
    habitsCompletedToday: number;
    habitsTotal: number;
  }> {
    // One round-trip — UNION ALL is awkward with mixed shapes, so use a CTE.
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{
        target_kcal: number | null;
        today_kcal: number;
        water_ml: number;
        sleep_hours: number | null;
        exercise_minutes: number;
        weight_kg: number | null;
        streak_days: number;
      }>
    >(
      `
      WITH me AS (
        SELECT id, target_kcal FROM public.clients
         WHERE user_id = $1::uuid
         LIMIT 1
      ),
      today_meals AS (
        SELECT COALESCE(SUM(kcal), 0)::int AS kcal
          FROM public.meal_logs
         WHERE client_id = (SELECT id FROM me)
           AND logged_at::date = CURRENT_DATE
      ),
      today_habit AS (
        SELECT water_intake, sleep_hours, activity_minutes, weight
          FROM public.daily_logs
         WHERE client_id = (SELECT id FROM me)
           AND log_date = CURRENT_DATE
         LIMIT 1
      ),
      -- Streak = consecutive days back from today with at least one signal.
      streak AS (
        SELECT COALESCE(MAX(streak_len), 0) AS days FROM (
          SELECT COUNT(*) AS streak_len
            FROM (
              SELECT log_date,
                     log_date - (ROW_NUMBER() OVER (ORDER BY log_date DESC))::int * INTERVAL '1 day' AS grp
                FROM public.daily_logs
               WHERE client_id = (SELECT id FROM me)
                 AND (water_intake > 0 OR activity_minutes > 0 OR weight IS NOT NULL OR sleep_hours IS NOT NULL)
                 AND log_date <= CURRENT_DATE
               ORDER BY log_date DESC
               LIMIT 90
            ) d
           WHERE log_date >= CURRENT_DATE - INTERVAL '90 days'
           GROUP BY grp
           ORDER BY MAX(log_date) DESC
           LIMIT 1
        ) s
      )
      SELECT
        (SELECT target_kcal FROM me)            AS target_kcal,
        (SELECT kcal FROM today_meals)          AS today_kcal,
        COALESCE((SELECT water_intake FROM today_habit), 0)        AS water_ml,
        (SELECT sleep_hours FROM today_habit)::numeric              AS sleep_hours,
        COALESCE((SELECT activity_minutes FROM today_habit), 0)    AS exercise_minutes,
        (SELECT weight FROM today_habit)::numeric                   AS weight_kg,
        (SELECT days FROM streak)::int                              AS streak_days
      `,
      userId,
    );

    if (!row) {
      // No clients row — caller isn't a client yet. Return a neutral snapshot.
      return {
        score: 0,
        scoreLabel: 'Get started',
        garden: gardenState(0, 0),
        streakDays: 0,
        todayKcal: 0,
        targetKcal: null,
        waterMl: 0,
        waterTargetMl: 2500,
        sleepHours: null,
        exerciseMinutes: 0,
        habitsCompletedToday: 0,
        habitsTotal: 3,
      };
    }

    const waterTargetMl = 2500;
    const targetKcal = row.target_kcal ?? null;
    const todayKcal = Number(row.today_kcal) || 0;
    const waterMl = Number(row.water_ml) || 0;
    const exerciseMinutes = Number(row.exercise_minutes) || 0;
    const sleepHours = row.sleep_hours != null ? Number(row.sleep_hours) : null;
    const streakDays = Number(row.streak_days) || 0;

    // Habit completion = each of (water, exercise, sleep) gets 0/1/2 based
    // on how close we are to the target. Total possible 6 → simple to display.
    const habitWater    = waterMl >= waterTargetMl * 0.9 ? 2 : waterMl >= waterTargetMl * 0.4 ? 1 : 0;
    const habitExercise = exerciseMinutes >= 30 ? 2 : exerciseMinutes >= 10 ? 1 : 0;
    const habitSleep    = sleepHours != null && sleepHours >= 7 ? 2 : sleepHours != null && sleepHours >= 5 ? 1 : 0;
    const habitPointsEarned = habitWater + habitExercise + habitSleep;
    const habitPointsMax = 6;

    // Score blends habits (50%), meal adherence (30%), streak bonus (20%).
    let mealAdherence = 0;
    if (targetKcal && targetKcal > 0) {
      // 1.0 within ±15% of target, then degrades linearly to 0 at ±60%.
      const off = Math.abs(todayKcal / targetKcal - 1);
      mealAdherence = off <= 0.15 ? 1 : Math.max(0, 1 - (off - 0.15) / 0.45);
    } else if (todayKcal > 0) {
      mealAdherence = 0.7; // logged at least one meal
    }
    const streakBonus = Math.min(1, streakDays / 14);
    const score = Math.round(
      ((habitPointsEarned / habitPointsMax) * 50) +
      (mealAdherence * 30) +
      (streakBonus * 20),
    );

    // "Living garden" framing for the mobile hero: how well you cared for it
    // TODAY (habits + meals, streak excluded) waters the plant; the streak
    // determines how established/grown it is. See gardenState() below.
    const todayCare = (habitPointsEarned / habitPointsMax) * 0.6 + mealAdherence * 0.4;

    return {
      score,
      scoreLabel: labelForScore(score),
      garden: gardenState(streakDays, todayCare),
      streakDays,
      todayKcal,
      targetKcal,
      waterMl,
      waterTargetMl,
      sleepHours,
      exerciseMinutes,
      habitsCompletedToday: habitPointsEarned,
      habitsTotal: habitPointsMax,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Habits — daily_logs CRUD
  // ─────────────────────────────────────────────────────────────────

  async myHabits(userId: string, days = 14): Promise<HabitDay[]> {
    const d = clamp(days, 1, 90);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        log_date: string;
        water_intake: number | null;
        sleep_hours: string | null;
        activity_minutes: number | null;
        weight: string | null;
      }>
    >(
      `SELECT to_char(dl.log_date, 'YYYY-MM-DD') AS log_date,
              dl.water_intake, dl.sleep_hours, dl.activity_minutes, dl.weight
         FROM public.daily_logs dl
         JOIN public.clients c ON c.id = dl.client_id
        WHERE c.user_id = $1::uuid
          AND dl.log_date > CURRENT_DATE - ($2 || ' days')::interval
        ORDER BY dl.log_date DESC`,
      userId,
      String(d),
    );
    return rows.map((r) => ({
      date: r.log_date,
      water_ml: Number(r.water_intake ?? 0),
      sleep_hours: r.sleep_hours != null ? Number(r.sleep_hours) : null,
      exercise_minutes: Number(r.activity_minutes ?? 0),
      weight_kg: r.weight != null ? Number(r.weight) : null,
      mood: null,
    }));
  }

  /**
   * UPSERT today's habit log. Frontend sends partial updates (just water,
   * or just weight) — we patch the existing row and leave other columns
   * alone. Returns the fresh row so the client cache can replace its copy.
   */
  async upsertHabit(
    userId: string,
    patch: Partial<{ water_ml: number; sleep_hours: number; exercise_minutes: number; weight_kg: number; date: string }>,
  ): Promise<HabitDay> {
    const date = patch.date ?? new Date().toISOString().slice(0, 10);
    // Find caller's client_id once.
    const [me] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!me) throw new NotFoundException('No client profile linked to this user');

    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{
        log_date: string;
        water_intake: number;
        sleep_hours: string | null;
        activity_minutes: number;
        weight: string | null;
      }>
    >(
      `
      INSERT INTO public.daily_logs (client_id, log_date, water_intake, sleep_hours, activity_minutes, weight)
      VALUES (
        $1::uuid, $2::date,
        $3::int,
        $4::numeric,
        $5::int,
        $6::numeric
      )
      -- Only the metric(s) present in this patch are non-null; every other
      -- column stays null so COALESCE keeps the day's existing value instead of
      -- zeroing it. (The previous COALESCE(..,0) on insert made EXCLUDED = 0,
      -- which then overwrote water/exercise to 0 whenever another metric logged.)
      ON CONFLICT (client_id, log_date) DO UPDATE SET
        water_intake     = COALESCE(EXCLUDED.water_intake,     public.daily_logs.water_intake),
        sleep_hours      = COALESCE(EXCLUDED.sleep_hours,      public.daily_logs.sleep_hours),
        activity_minutes = COALESCE(EXCLUDED.activity_minutes, public.daily_logs.activity_minutes),
        weight           = COALESCE(EXCLUDED.weight,           public.daily_logs.weight),
        updated_at       = now()
      RETURNING to_char(log_date, 'YYYY-MM-DD') AS log_date,
                water_intake, sleep_hours, activity_minutes, weight
      `,
      me.id,
      date,
      patch.water_ml ?? null,
      patch.sleep_hours ?? null,
      patch.exercise_minutes ?? null,
      patch.weight_kg ?? null,
    );

    // Keep the client's headline "last weight" (shown on the nutritionist's
    // dashboard, sourced from clients.last_weight) in sync whenever a weight is
    // logged from the habit tiles — otherwise the two weight stores drift apart.
    if (patch.weight_kg != null && Number.isFinite(patch.weight_kg) && patch.weight_kg > 0) {
      await this.prisma.$queryRawUnsafe(
        `UPDATE public.clients SET last_weight = $2 WHERE id = $1::uuid`,
        me.id, patch.weight_kg,
      );
    }

    return {
      date: row.log_date,
      water_ml: Number(row.water_intake ?? 0),
      sleep_hours: row.sleep_hours != null ? Number(row.sleep_hours) : null,
      exercise_minutes: Number(row.activity_minutes ?? 0),
      weight_kg: row.weight != null ? Number(row.weight) : null,
      mood: null,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Achievements
  // ─────────────────────────────────────────────────────────────────

  async myAchievements(userId: string): Promise<Achievement[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        code: string;
        title: string;
        description: string;
        icon_name: string;
        target_value: number;
        current_value: number | null;
        unlocked_at: string | null;
      }>
    >(
      `SELECT a.id, a.code, a.title, a.description, a.icon_name, a.target_value,
              ua.current_value, ua.unlocked_at
         FROM public.achievements a
         LEFT JOIN public.user_achievements ua
                ON ua.achievement_id = a.id AND ua.user_id = $1::uuid
        ORDER BY ua.unlocked_at NULLS LAST, a.created_at`,
      userId,
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      icon: ICON_MAP[r.icon_name] ?? '🏆',
      earned_at: r.unlocked_at,
      progress: r.unlocked_at
        ? 100
        : r.target_value > 0
          ? Math.min(100, Math.round(((r.current_value ?? 0) / r.target_value) * 100))
          : 0,
    }));
  }

  // ─────────────────────────────────────────────────────────────────
  // Send message (client → nutritionist)
  // ─────────────────────────────────────────────────────────────────

  async sendMessage(userId: string, opts: SendOpts): Promise<ClientMessage> {
    const body = (opts.content ?? '').trim();
    if (!body && !opts.attachment) throw new BadRequestException('Message cannot be empty.');
    if (body.length > 4000) throw new BadRequestException('Message too long (max 4000 characters).');

    const [me] = await this.prisma.$queryRawUnsafe<Array<{ id: string; workspace_id: string; name: string }>>(
      `SELECT id, workspace_id, name FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!me) throw new NotFoundException('No client profile linked to this user');

    const reply = await this.buildReplyMeta(me.id, opts.replyTo);
    const meta = reply ? { reply } : {};
    const att = opts.attachment;
    const [row] = await this.prisma.$queryRawUnsafe<ClientMessage[]>(
      `INSERT INTO public.messages
         (client_id, sender_id, sender_type, message_type, content, metadata,
          attachment_url, attachment_name, attachment_type, attachment_size)
       VALUES ($1::uuid, $2::uuid, 'client', $3, $4, $5::jsonb, $6, $7, $8, $9)
       RETURNING id, sender_type, message_type, content, is_read, created_at, metadata,
                 attachment_url, attachment_name, attachment_type, attachment_size`,
      me.id, userId, msgTypeFor(att), body, JSON.stringify(meta),
      att?.url ?? null, att?.name ?? null, att?.type ?? null, att?.size ?? null,
    );

    // Notify the workspace's staff (nutritionist) on their own devices that a
    // client just messaged — so they see it even with the app closed.
    const preview = body || (msgTypeFor(att) === 'image' ? '📷 Photo' : msgTypeFor(att) === 'voice' ? '🎤 Voice message' : '📎 Attachment');
    void this.notifications.notifyStaff(me.workspace_id, {
      type: 'message:client',
      title: `💬 New message from ${me.name}`,
      body: preview.length > 140 ? `${preview.slice(0, 140)}…` : preview,
      url: `/messaging/${me.id}`,
      tag: `client-msg-${me.id}`,
    });

    return row;
  }

  /** Build the reply-preview metadata for a message being replied to (scoped to the thread). */
  private async buildReplyMeta(clientId: string, replyToId?: string): Promise<{ id: string; sender: string; preview: string } | null> {
    if (!replyToId) return null;
    const [r] = await this.prisma.$queryRawUnsafe<Array<{ id: string; sender_type: string; content: string; message_type: string }>>(
      `SELECT id, sender_type, content, message_type FROM public.messages
        WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1`,
      replyToId, clientId,
    );
    if (!r) return null;
    const preview = (r.content && r.content.trim())
      ? r.content.slice(0, 120)
      : r.message_type === 'image' ? '📷 Photo'
      : r.message_type === 'voice' ? '🎤 Voice message'
      : r.message_type === 'file' ? '📎 File' : '';
    return { id: r.id, sender: r.sender_type, preview };
  }

  /**
   * Send a message FROM an admin TO a specific client and push-notify them.
   * Caller responsibility: confirm the admin owns this workspace and that
   * the client_id belongs to it. We don't re-verify here because the only
   * controller calling this is workspace-scoped already.
   */
  async sendAdminMessage(
    workspaceId: string,
    senderUserId: string,
    clientId: string,
    opts: SendOpts,
  ): Promise<ClientMessage> {
    const body = (opts.content ?? '').trim();
    if (!body && !opts.attachment) throw new BadRequestException('Message cannot be empty.');
    if (body.length > 4000) throw new BadRequestException('Message too long (max 4000 characters).');

    // Defensive — confirm client belongs to caller's workspace.
    const [client] = await this.prisma.$queryRawUnsafe<Array<{ id: string; name: string; practice_name: string; logo_url: string | null }>>(
      `SELECT c.id, c.name,
              COALESCE(NULLIF(w.display_name, ''), w.name) AS practice_name,
              w.logo_url
         FROM public.clients c
         JOIN public.workspaces w ON w.id = c.workspace_id
        WHERE c.id = $1::uuid AND c.workspace_id = $2::uuid
        LIMIT 1`,
      clientId,
      workspaceId,
    );
    if (!client) throw new NotFoundException('Client not found in this workspace.');

    const reply = await this.buildReplyMeta(clientId, opts.replyTo);
    // Schedule for later only when the timestamp is genuinely in the future.
    const scheduled = opts.scheduledFor && new Date(opts.scheduledFor).getTime() > Date.now()
      ? opts.scheduledFor : null;
    const meta: MessageMetadata & { status?: string; scheduled_for?: string } = { ...(reply ? { reply } : {}) };
    if (scheduled) { meta.status = 'scheduled'; meta.scheduled_for = scheduled; }
    const att = opts.attachment;
    const [row] = await this.prisma.$queryRawUnsafe<ClientMessage[]>(
      `INSERT INTO public.messages
         (client_id, sender_id, sender_type, message_type, content, metadata,
          attachment_url, attachment_name, attachment_type, attachment_size)
       VALUES ($1::uuid, $2::uuid, 'admin', $3, $4, $5::jsonb, $6, $7, $8, $9)
       RETURNING id, sender_type, message_type, content, is_read, created_at, metadata,
                 attachment_url, attachment_name, attachment_type, attachment_size`,
      clientId, senderUserId, msgTypeFor(att), body, JSON.stringify(meta),
      att?.url ?? null, att?.name ?? null, att?.type ?? null, att?.size ?? null,
    );

    // Don't notify for scheduled messages — that happens when the cron delivers them.
    if (!scheduled) {
      const pushBody = body || (att ? (msgTypeFor(att) === 'image' ? '📷 Photo' : msgTypeFor(att) === 'voice' ? '🎤 Voice message' : '📎 Attachment') : '');
      // Only forward a hosted logo URL (not a big data: URI, which would blow the
      // ~4 KB web-push payload limit); otherwise the SW falls back to the app icon.
      const logo = client.logo_url && /^https?:\/\//.test(client.logo_url) && client.logo_url.length < 400
        ? client.logo_url : undefined;
      void this.notifications.notifyClient(workspaceId, clientId, {
        type: 'message:admin',
        title: `💬 ${client.practice_name || 'New message'}`,
        body: pushBody.length > 140 ? `${pushBody.slice(0, 140)}…` : pushBody,
        url: '/portal/chat',
        icon: logo,
        tag: `msg-${clientId}`,
      });
    }

    return row;
  }

  // ── Quick-reply templates (workspace-scoped canned replies) ─────────
  async listQuickReplies(workspaceId: string): Promise<QuickReply[]> {
    return this.prisma.$queryRawUnsafe<QuickReply[]>(
      `SELECT id, name AS label, template AS body FROM public.message_templates
        WHERE workspace_id = $1::uuid AND category = 'quick_reply' AND is_active = true
        ORDER BY created_at DESC LIMIT 100`,
      workspaceId,
    );
  }
  async createQuickReply(workspaceId: string, body: string, label?: string): Promise<QuickReply> {
    const text = body.trim();
    if (!text) throw new BadRequestException('Quick reply cannot be empty.');
    // message_templates.name is globally unique, so derive a collision-proof internal name.
    const name = (label?.trim() || text.slice(0, 40)) + ' · ' + randomBytes(3).toString('hex');
    const [row] = await this.prisma.$queryRawUnsafe<QuickReply[]>(
      `INSERT INTO public.message_templates (workspace_id, name, category, template, is_active)
       VALUES ($1::uuid, $2, 'quick_reply', $3, true)
       RETURNING id, name AS label, template AS body`,
      workspaceId, name, text,
    );
    return row;
  }
  async deleteQuickReply(workspaceId: string, id: string): Promise<{ deleted: true }> {
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.message_templates
        WHERE id = $1::uuid AND workspace_id = $2::uuid AND category = 'quick_reply'`,
      id, workspaceId,
    );
    return { deleted: true };
  }

  // ── Scheduled messages (owner) ──────────────────────────────────────
  async listScheduled(workspaceId: string, clientId: string): Promise<ClientMessage[]> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    return this.prisma.$queryRawUnsafe<ClientMessage[]>(
      `SELECT id, sender_type, message_type, content, is_read, created_at, metadata,
              attachment_url, attachment_name, attachment_type, attachment_size
         FROM public.messages
        WHERE client_id = $1::uuid AND metadata->>'status' = 'scheduled'
        ORDER BY (metadata->>'scheduled_for')::timestamptz ASC LIMIT 50`,
      clientId,
    );
  }
  async cancelScheduled(workspaceId: string, messageId: string): Promise<{ cancelled: true }> {
    await this.loadMessageForAdmin(workspaceId, messageId); // scope check
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.messages WHERE id = $1::uuid AND metadata->>'status' = 'scheduled'`,
      messageId,
    );
    return { cancelled: true };
  }

  /** Deliver scheduled messages whose time has arrived — checked every second
   *  so a message goes out at its scheduled second, not at the next minute. */
  @Cron(CronExpression.EVERY_SECOND)
  async deliverScheduledMessages(): Promise<void> {
    const due = await this.prisma.$queryRawUnsafe<Array<{ id: string; client_id: string; content: string; message_type: string; workspace_id: string }>>(
      `WITH due AS (
         UPDATE public.messages
            SET created_at = now(), metadata = (metadata - 'status') - 'scheduled_for'
          WHERE metadata->>'status' = 'scheduled'
            AND (metadata->>'scheduled_for')::timestamptz <= now()
          RETURNING id, client_id, content, message_type, workspace_id
       )
       SELECT d.id, d.client_id, d.content, d.message_type,
              COALESCE(d.workspace_id, c.workspace_id) AS workspace_id
         FROM due d JOIN public.clients c ON c.id = d.client_id`,
    );
    for (const m of due) {
      const pushBody = m.content || (m.message_type === 'image' ? '📷 Photo' : m.message_type === 'voice' ? '🎤 Voice message' : m.message_type === 'file' ? '📎 Attachment' : '');
      void this.notifications.notifyClient(m.workspace_id, m.client_id, {
        type: 'message:admin',
        title: '💬 New message from your nutritionist',
        body: pushBody.length > 140 ? `${pushBody.slice(0, 140)}…` : pushBody,
        url: '/portal/chat', tag: `msg-${m.client_id}`,
      });
    }
    if (due.length) this.logger.log(`Delivered ${due.length} scheduled message(s).`);
  }

  /**
   * Auto meeting reminders — push the client ~15 minutes before an appointment.
   * The UPDATE atomically claims rows (stamps reminded_at) so each appointment
   * is reminded exactly once even across overlapping runs.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sendAppointmentReminders(): Promise<void> {
    const due = await this.prisma.$queryRawUnsafe<Array<{ id: string; client_id: string; kind: string; mode: string; workspace_id: string }>>(
      `UPDATE public.appointments
          SET reminded_at = now()
        WHERE status = 'scheduled'
          AND reminded_at IS NULL
          AND scheduled_at > now()
          AND scheduled_at <= now() + interval '15 minutes'
      RETURNING id, client_id, kind, mode, workspace_id`,
    );
    for (const a of due) {
      void this.notifications.notifyClient(a.workspace_id, a.client_id, {
        type: 'appointment:reminder',
        title: '⏰ Appointment in 15 minutes',
        body: `Your ${labelForKind(a.kind as Appointment['kind'])} starts soon.${a.mode === 'video' ? ' Tap to join.' : ''}`,
        url: a.mode === 'video' ? `/portal/appointments/${a.id}/meet` : '/portal/appointments',
        tag: `appt-reminder-${a.id}`,
      });
    }
    if (due.length) this.logger.log(`Sent ${due.length} appointment reminder(s).`);
  }

  // ── Message interactions (reactions / edit / delete / pin / read) ────
  // All metadata-driven (no migration). Scoped: admin → workspace, client → own thread.

  private async loadMessageForAdmin(workspaceId: string, messageId: string) {
    const [m] = await this.prisma.$queryRawUnsafe<Array<{ id: string; sender_type: string; metadata: MessageMetadata | null; created_at: Date | string }>>(
      `SELECT m.id, m.sender_type, m.metadata, m.created_at
         FROM public.messages m JOIN public.clients c ON c.id = m.client_id
        WHERE m.id = $1::uuid AND c.workspace_id = $2::uuid LIMIT 1`,
      messageId, workspaceId,
    );
    if (!m) throw new NotFoundException('Message not found.');
    return m;
  }
  private async loadMessageForClient(userId: string, messageId: string) {
    const [m] = await this.prisma.$queryRawUnsafe<Array<{ id: string; sender_type: string; metadata: MessageMetadata | null; created_at: Date | string }>>(
      `SELECT m.id, m.sender_type, m.metadata, m.created_at
         FROM public.messages m JOIN public.clients c ON c.id = m.client_id
        WHERE m.id = $1::uuid AND c.user_id = $2::uuid LIMIT 1`,
      messageId, userId,
    );
    if (!m) throw new NotFoundException('Message not found.');
    return m;
  }
  private async writeMetadata(messageId: string, metadata: MessageMetadata): Promise<void> {
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.messages SET metadata = $2::jsonb WHERE id = $1::uuid`,
      messageId, JSON.stringify(metadata),
    );
  }

  /** Toggle a reaction emoji for one side ('admin' | 'client') on a message. */
  private mergeReaction(meta: MessageMetadata | null, side: 'admin' | 'client', emoji: string): MessageMetadata {
    const next: MessageMetadata = { ...(meta ?? {}) };
    const reactions = { ...(next.reactions ?? {}) };
    if (reactions[side] === emoji) delete reactions[side];
    else reactions[side] = emoji;
    next.reactions = reactions;
    return next;
  }

  async reactAdmin(workspaceId: string, messageId: string, emoji: string): Promise<{ ok: true }> {
    const m = await this.loadMessageForAdmin(workspaceId, messageId);
    await this.writeMetadata(messageId, this.mergeReaction(m.metadata, 'admin', emoji));
    return { ok: true };
  }
  async reactClient(userId: string, messageId: string, emoji: string): Promise<{ ok: true }> {
    const m = await this.loadMessageForClient(userId, messageId);
    await this.writeMetadata(messageId, this.mergeReaction(m.metadata, 'client', emoji));
    return { ok: true };
  }

  /**
   * Edit and "delete for everyone" are only allowed within this window of the
   * message being sent (WhatsApp-style). After it, the content is settled: a
   * message the other side may already have read can't be silently rewritten or
   * unsent. "Delete for me" is exempt — hiding a message on your own side is
   * always allowed. Enforced server-side because the client UI hiding the
   * action is not a control; the API is.
   */
  private static readonly MESSAGE_MUTATION_WINDOW_MS = 15 * 60 * 1000;

  /** Throw once the 15-minute window has elapsed since the message was sent. */
  private assertWithinMutationWindow(createdAt: Date | string, action: 'edit' | 'delete'): void {
    const created = new Date(createdAt).getTime();
    // If the timestamp is somehow unparseable, fail open rather than trap the
    // user — the ownership check above is the real guard.
    if (!Number.isFinite(created)) return;
    if (Date.now() - created > ClientsService.MESSAGE_MUTATION_WINDOW_MS) {
      throw new BadRequestException(
        action === 'edit'
          ? 'Messages can only be edited within 15 minutes of sending.'
          : 'Messages can only be deleted for everyone within 15 minutes of sending.',
      );
    }
  }

  /** Edit own message content (sets edited_at). Side must own the message. */
  private async editScoped(m: { id: string; sender_type: string; metadata: MessageMetadata | null; created_at: Date | string }, side: 'admin' | 'client', content: string): Promise<{ ok: true }> {
    if (m.sender_type !== side) throw new BadRequestException('You can only edit your own messages.');
    this.assertWithinMutationWindow(m.created_at, 'edit');
    const body = content.trim();
    if (!body) throw new BadRequestException('Message cannot be empty.');
    if (body.length > 4000) throw new BadRequestException('Message too long.');
    const meta: MessageMetadata = { ...(m.metadata ?? {}), edited_at: new Date().toISOString() };
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.messages SET content = $2, metadata = $3::jsonb WHERE id = $1::uuid`,
      m.id, body, JSON.stringify(meta),
    );
    return { ok: true };
  }
  async editAdmin(workspaceId: string, messageId: string, content: string) {
    return this.editScoped(await this.loadMessageForAdmin(workspaceId, messageId), 'admin', content);
  }
  async editClient(userId: string, messageId: string, content: string) {
    return this.editScoped(await this.loadMessageForClient(userId, messageId), 'client', content);
  }

  /**
   * Delete a message. scope='everyone' soft-deletes for both sides (own messages
   * only). scope='me' just hides it from the requesting side (any message).
   */
  private async deleteScoped(m: { id: string; sender_type: string; metadata: MessageMetadata | null; created_at: Date | string }, side: 'admin' | 'client', scope: 'me' | 'everyone'): Promise<{ ok: true }> {
    if (scope === 'everyone') {
      if (m.sender_type !== side) throw new BadRequestException('You can only delete your own messages for everyone.');
      this.assertWithinMutationWindow(m.created_at, 'delete');
      const meta: MessageMetadata = { ...(m.metadata ?? {}), deleted_at: new Date().toISOString() };
      await this.prisma.$queryRawUnsafe(
        `UPDATE public.messages
            SET content = '', attachment_url = NULL, attachment_name = NULL, attachment_type = NULL, attachment_size = NULL,
                metadata = $2::jsonb
          WHERE id = $1::uuid`,
        m.id, JSON.stringify(meta),
      );
    } else {
      const meta: MessageMetadata = { ...(m.metadata ?? {}), [side === 'admin' ? 'hidden_admin' : 'hidden_client']: true };
      await this.writeMetadata(m.id, meta);
    }
    return { ok: true };
  }
  async deleteAdmin(workspaceId: string, messageId: string, scope: 'me' | 'everyone' = 'everyone') {
    return this.deleteScoped(await this.loadMessageForAdmin(workspaceId, messageId), 'admin', scope);
  }
  async deleteClient(userId: string, messageId: string, scope: 'me' | 'everyone' = 'everyone') {
    return this.deleteScoped(await this.loadMessageForClient(userId, messageId), 'client', scope);
  }

  /** Pin / unpin a message in the thread (either side may pin). */
  private togglePin(meta: MessageMetadata | null, pinned: boolean): MessageMetadata {
    const next: MessageMetadata = { ...(meta ?? {}) };
    if (pinned) next.pinned_at = new Date().toISOString();
    else delete next.pinned_at;
    return next;
  }
  async pinAdmin(workspaceId: string, messageId: string, pinned: boolean): Promise<{ ok: true }> {
    const m = await this.loadMessageForAdmin(workspaceId, messageId);
    await this.writeMetadata(messageId, this.togglePin(m.metadata, pinned));
    return { ok: true };
  }
  async pinClient(userId: string, messageId: string, pinned: boolean): Promise<{ ok: true }> {
    const m = await this.loadMessageForClient(userId, messageId);
    await this.writeMetadata(messageId, this.togglePin(m.metadata, pinned));
    return { ok: true };
  }

  /** Client marks the nutritionist's messages read (drives the admin's read receipts). */
  async markMyThreadRead(userId: string): Promise<{ marked: number }> {
    const res = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE public.messages m
          SET is_read = true
         FROM public.clients c
        WHERE c.id = m.client_id AND c.user_id = $1::uuid
          AND m.sender_type = 'admin' AND m.is_read = false
        RETURNING m.id`,
      userId,
    );
    return { marked: res.length };
  }

  // ─────────────────────────────────────────────────────────────────
  // Update profile (settings save)
  //
  // Only writable fields are exposed; status / workspace_id / target_kcal
  // are nutritionist-controlled and ignored if passed.
  // ─────────────────────────────────────────────────────────────────

  async updateMyProfile(
    userId: string,
    patch: Partial<{
      name: string;
      age: number;
      gender: string;
      goals: string;
      phone: string;
      allergies: string;
      medical_conditions: string;
      food_preferences: string;
      activity_level: string;
      height_cm: number;
      weight_kg: number;
      avatar_url: string;
    }>,
  ): Promise<ClientProfile> {
    // Build dynamic UPDATE — only columns the client actually changed.
    const sets: string[] = [];
    const vals: unknown[] = [];
    const allowed: Array<keyof typeof patch> = [
      'name', 'age', 'gender', 'goals', 'phone',
      'allergies', 'medical_conditions', 'food_preferences',
      'activity_level', 'height_cm', 'weight_kg', 'avatar_url',
    ];
    // Columns backed by a Postgres enum need an explicit cast: Prisma binds
    // raw-query params as text, and Postgres refuses to assign text directly
    // to an enum column (error 42804). node-postgres papers over this by
    // sending untyped params, which is why a plain UPDATE works from psql but
    // 500s here. Cast those columns to their enum type in the generated SQL.
    const enumCast: Partial<Record<keyof typeof patch, string>> = {
      gender: 'gender_type',
    };
    // The client's "current weight" writes to the clients.last_weight column.
    const columnName: Partial<Record<keyof typeof patch, string>> = {
      weight_kg: 'last_weight',
    };
    for (const key of allowed) {
      if (patch[key] !== undefined) {
        vals.push(patch[key]);
        const cast = enumCast[key];
        sets.push(`${columnName[key] ?? key} = $${vals.length}${cast ? `::${cast}` : ''}`);
      }
    }
    if (sets.length === 0) {
      // No-op — just return current profile.
      return this.myProfile(userId);
    }
    vals.push(userId);
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.clients
          SET ${sets.join(', ')}, updated_at = now()
        WHERE user_id = $${vals.length}::uuid`,
      ...vals,
    );
    return this.myProfile(userId);
  }

  /** Heartbeat: stamp the client's presence. Called by the client app while open. */
  async recordPresence(userId: string): Promise<{ ok: true }> {
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.clients SET last_active_at = now() WHERE user_id = $1::uuid`,
      userId,
    );
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────────
  // Appointments — list / book / cancel
  // ─────────────────────────────────────────────────────────────────

  async myAppointments(userId: string): Promise<Appointment[]> {
    const rows = await this.prisma.$queryRawUnsafe<Appointment[]>(
      `SELECT a.id, a.scheduled_at, a.duration_minutes,
              a.kind, a.mode, a.status,
              a.meeting_url, a.location, a.notes,
              a.cancelled_at, a.cancel_reason,
              a.rescheduled_at, a.previous_scheduled_at
         FROM public.appointments a
         JOIN public.clients c ON c.id = a.client_id
        WHERE c.user_id = $1::uuid
        ORDER BY a.scheduled_at DESC
        LIMIT 100`,
      userId,
    );
    return rows;
  }

  async bookAppointment(
    userId: string,
    body: {
      scheduled_at: string;
      duration_minutes?: number;
      kind: 'consultation' | 'follow_up' | 'check_in' | 'assessment' | 'group_session';
      mode?: 'video' | 'phone' | 'in_person';
      notes?: string;
    },
  ): Promise<Appointment> {
    const [me] = await this.prisma.$queryRawUnsafe<Array<{ id: string; workspace_id: string; name: string }>>(
      `SELECT id, workspace_id, name FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!me) throw new NotFoundException('No client profile linked to this user');

    const when = new Date(body.scheduled_at);
    if (Number.isNaN(when.getTime())) {
      throw new BadRequestException('scheduled_at must be a valid ISO timestamp.');
    }
    if (when.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('Appointment must be in the future.');
    }

    const mode = body.mode ?? 'video';
    // A client booking is a *request*: it lands as 'pending' and the
    // nutritionist must approve it before it becomes a confirmed session.
    const [row] = await this.prisma.$queryRawUnsafe<Appointment[]>(
      `INSERT INTO public.appointments
         (client_id, workspace_id, scheduled_at, duration_minutes, kind, mode, notes, meeting_url, status)
       VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, $5, $6, $7, $8, 'pending')
       RETURNING id, scheduled_at, duration_minutes,
                 kind, mode, status,
                 meeting_url, location, notes,
                 cancelled_at, cancel_reason`,
      me.id,
      me.workspace_id,
      when.toISOString(),
      body.duration_minutes ?? 30,
      body.kind,
      mode,
      body.notes ?? null,
      meetingUrlFor(mode),
    );

    // Confirm the *request* on the client's own devices (multi-device users see
    // it immediately, and it lands in their notification history).
    void this.notifications.notifyClient(me.workspace_id, me.id, {
      type: 'appointment:requested',
      title: '📅 Appointment requested',
      body: `${labelForKind(row.kind)} on ${formatWhen(row.scheduled_at)} — awaiting your nutritionist's confirmation.`,
      url: '/portal/appointments',
      tag: `appt-${row.id}`,
    });

    // Alert the workspace so a coach can approve or decline the request.
    void this.notifications.notifyStaff(me.workspace_id, {
      type: 'appointment:requested',
      title: '🗓️ New appointment request',
      body: `${me.name} requested a ${labelForKind(row.kind).toLowerCase()} on ${formatWhen(row.scheduled_at)}.`,
      url: `/appointments/${row.id}`,
      tag: `appt-${row.id}`,
    });

    return row;
  }

  async cancelAppointment(userId: string, apptId: string, reason?: string): Promise<Appointment> {
    const rows = await this.prisma.$queryRawUnsafe<Appointment[]>(
      `UPDATE public.appointments a
          SET status = 'cancelled',
              cancelled_at = now(),
              cancelled_by = $1::uuid,
              cancel_reason = $3
         FROM public.clients c
        WHERE a.client_id = c.id
          AND c.user_id = $1::uuid
          AND a.id = $2::uuid
          AND a.status IN ('scheduled', 'pending')
       RETURNING a.id, a.scheduled_at, a.duration_minutes,
                 a.kind, a.mode, a.status,
                 a.meeting_url, a.location, a.notes,
                 a.cancelled_at, a.cancel_reason`,
      userId,
      apptId,
      reason ?? null,
    );
    if (!rows.length) {
      throw new NotFoundException('Appointment not found, already cancelled, or not yours.');
    }
    const appt = rows[0];

    // Lookup client_id so push can address by client (not user) and notify.
    const [me] = await this.prisma.$queryRawUnsafe<Array<{ id: string; workspace_id: string }>>(
      `SELECT id, workspace_id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (me) {
      void this.notifications.notifyClient(me.workspace_id, me.id, {
        type: 'appointment:cancelled',
        title: '❌ Appointment cancelled',
        body: `${labelForKind(appt.kind)} on ${formatWhen(appt.scheduled_at)} was cancelled.`,
        url: '/portal/appointments',
        tag: `appt-${appt.id}`,
      });
    }
    return appt;
  }

  /** Fetch one of the caller's own appointments (used by the meeting room page). */
  async getMyAppointment(userId: string, apptId: string): Promise<Appointment> {
    const [row] = await this.prisma.$queryRawUnsafe<Appointment[]>(
      `SELECT a.id, a.scheduled_at, a.duration_minutes, a.kind, a.mode, a.status,
              a.meeting_url, a.location, a.notes, a.cancelled_at, a.cancel_reason
         FROM public.appointments a
         JOIN public.clients c ON c.id = a.client_id
        WHERE c.user_id = $1::uuid AND a.id = $2::uuid
        LIMIT 1`,
      userId, apptId,
    );
    if (!row) throw new NotFoundException('Appointment not found.');
    return row;
  }

  // ─────────────────────────────────────────────────────────────────
  // Workspace-side appointment management (owner / nutritionist)
  // ─────────────────────────────────────────────────────────────────

  private readonly APPT_SELECT = `a.id, a.client_id, c.name AS client_name, c.avatar_url AS client_avatar,
              a.scheduled_at, a.duration_minutes, a.kind, a.mode, a.status,
              a.meeting_url, a.location, a.notes, a.cancelled_at, a.cancel_reason`;

  async listWorkspaceAppointments(workspaceId: string, fromIso?: string, toIso?: string): Promise<WorkspaceAppointment[]> {
    const clauses = ['a.workspace_id = $1::uuid'];
    const params: unknown[] = [workspaceId];
    if (fromIso && !Number.isNaN(new Date(fromIso).getTime())) { params.push(new Date(fromIso).toISOString()); clauses.push(`a.scheduled_at >= $${params.length}::timestamptz`); }
    if (toIso && !Number.isNaN(new Date(toIso).getTime())) { params.push(new Date(toIso).toISOString()); clauses.push(`a.scheduled_at <= $${params.length}::timestamptz`); }
    return this.prisma.$queryRawUnsafe<WorkspaceAppointment[]>(
      `SELECT ${this.APPT_SELECT}
         FROM public.appointments a
         JOIN public.clients c ON c.id = a.client_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY a.scheduled_at ASC
        LIMIT 500`,
      ...params,
    );
  }

  async getWorkspaceAppointment(workspaceId: string, apptId: string): Promise<WorkspaceAppointment> {
    const [row] = await this.prisma.$queryRawUnsafe<WorkspaceAppointment[]>(
      `SELECT ${this.APPT_SELECT}
         FROM public.appointments a
         JOIN public.clients c ON c.id = a.client_id
        WHERE a.workspace_id = $1::uuid AND a.id = $2::uuid
        LIMIT 1`,
      workspaceId, apptId,
    );
    if (!row) throw new NotFoundException('Appointment not found.');
    return row;
  }

  async createWorkspaceAppointment(
    workspaceId: string,
    nutritionistUserId: string,
    body: {
      client_id: string; scheduled_at: string; duration_minutes?: number;
      kind: Appointment['kind']; mode?: Appointment['mode']; notes?: string; location?: string;
    },
  ): Promise<WorkspaceAppointment> {
    const [client] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
      body.client_id, workspaceId,
    );
    if (!client) throw new NotFoundException('Client not found in this workspace.');
    const when = new Date(body.scheduled_at);
    if (Number.isNaN(when.getTime())) throw new BadRequestException('scheduled_at must be a valid ISO timestamp.');
    const mode = body.mode ?? 'video';
    const [row] = await this.prisma.$queryRawUnsafe<WorkspaceAppointment[]>(
      `WITH ins AS (
         INSERT INTO public.appointments
           (client_id, workspace_id, nutritionist_id, scheduled_at, duration_minutes, kind, mode, notes, location, meeting_url)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::timestamptz, $5, $6, $7, $8, $9, $10)
         RETURNING *)
       SELECT ${this.APPT_SELECT} FROM ins a JOIN public.clients c ON c.id = a.client_id`,
      body.client_id, workspaceId, nutritionistUserId, when.toISOString(),
      body.duration_minutes ?? 30, body.kind, mode, body.notes ?? null, body.location ?? null, meetingUrlFor(mode),
    );
    void this.notifications.notifyClient(workspaceId, body.client_id, {
      type: 'appointment:scheduled',
      title: '📅 New appointment scheduled',
      body: `${labelForKind(row.kind)} on ${formatWhen(row.scheduled_at)}`,
      url: '/portal/appointments', tag: `appt-${row.id}`,
    });
    return row;
  }

  async updateWorkspaceAppointment(
    workspaceId: string,
    apptId: string,
    patch: {
      scheduled_at?: string; duration_minutes?: number; kind?: Appointment['kind'];
      mode?: Appointment['mode']; status?: Appointment['status']; notes?: string; location?: string;
    },
  ): Promise<WorkspaceAppointment> {
    const cur = await this.getWorkspaceAppointment(workspaceId, apptId);
    const when = patch.scheduled_at ? new Date(patch.scheduled_at) : new Date(cur.scheduled_at);
    if (Number.isNaN(when.getTime())) throw new BadRequestException('Invalid scheduled_at.');
    const duration = patch.duration_minutes ?? cur.duration_minutes;
    const kind = patch.kind ?? cur.kind;
    const mode = patch.mode ?? cur.mode;
    const status = patch.status ?? cur.status;
    const notes = patch.notes !== undefined ? patch.notes : cur.notes;
    const location = patch.location !== undefined ? patch.location : cur.location;
    // Video appointments always carry a room; non-video ones drop it.
    let meetingUrl = cur.meeting_url;
    if (mode === 'video' && !meetingUrl) meetingUrl = meetingUrlFor('video');
    if (mode !== 'video') meetingUrl = null;

    // If the nutritionist moved the time, record it so the client sees a
    // "rescheduled · moved from [old]" note. previous_scheduled_at holds the
    // time before this change.
    const timeChanged = !!patch.scheduled_at
      && new Date(patch.scheduled_at).getTime() !== new Date(cur.scheduled_at).getTime();
    const params: unknown[] = [workspaceId, apptId, when.toISOString(), duration, kind, mode, status, notes, location, meetingUrl];
    let rescheduleSet = '';
    if (timeChanged) {
      params.push(new Date(cur.scheduled_at).toISOString()); // previous time
      rescheduleSet = `, rescheduled_at = now(), previous_scheduled_at = $${params.length}::timestamptz`;
    }

    const [row] = await this.prisma.$queryRawUnsafe<WorkspaceAppointment[]>(
      `WITH upd AS (
         UPDATE public.appointments
            SET scheduled_at = $3::timestamptz, duration_minutes = $4, kind = $5, mode = $6,
                status = $7, notes = $8, location = $9, meeting_url = $10${rescheduleSet},
                cancelled_at = CASE WHEN $7 = 'cancelled' THEN now() ELSE cancelled_at END
          WHERE workspace_id = $1::uuid AND id = $2::uuid
          RETURNING *)
       SELECT ${this.APPT_SELECT} FROM upd a JOIN public.clients c ON c.id = a.client_id`,
      ...params,
    );
    if (!row) throw new NotFoundException('Appointment not found.');
    return row;
  }

  async cancelWorkspaceAppointment(workspaceId: string, nutritionistUserId: string, apptId: string, reason?: string): Promise<WorkspaceAppointment> {
    const [row] = await this.prisma.$queryRawUnsafe<WorkspaceAppointment[]>(
      `WITH upd AS (
         UPDATE public.appointments
            SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2::uuid, cancel_reason = $4
          WHERE workspace_id = $1::uuid AND id = $3::uuid AND status = 'scheduled'
          RETURNING *)
       SELECT ${this.APPT_SELECT} FROM upd a JOIN public.clients c ON c.id = a.client_id`,
      workspaceId, nutritionistUserId, apptId, reason ?? null,
    );
    if (!row) throw new NotFoundException('Appointment not found or not scheduled.');
    void this.notifications.notifyClient(workspaceId, row.client_id, {
      type: 'appointment:cancelled',
      title: 'Appointment cancelled',
      body: `${labelForKind(row.kind)} on ${formatWhen(row.scheduled_at)} was cancelled.`,
      url: '/portal/appointments', tag: `appt-${row.id}`,
    });
    return row;
  }

  /**
   * Approve a client-requested appointment: pending -> scheduled. Claims the
   * appointment for the approving coach (if unassigned) and materialises a video
   * room for video calls. Notifies the client that their request is confirmed.
   */
  async approveWorkspaceAppointment(workspaceId: string, nutritionistUserId: string, apptId: string): Promise<WorkspaceAppointment> {
    const [row] = await this.prisma.$queryRawUnsafe<WorkspaceAppointment[]>(
      `WITH upd AS (
         UPDATE public.appointments
            SET status = 'scheduled',
                approved_at = now(),
                approved_by = $2::uuid,
                nutritionist_id = COALESCE(nutritionist_id, $2::uuid),
                meeting_url = CASE WHEN mode = 'video' AND meeting_url IS NULL THEN $4 ELSE meeting_url END
          WHERE workspace_id = $1::uuid AND id = $3::uuid AND status = 'pending'
          RETURNING *)
       SELECT ${this.APPT_SELECT} FROM upd a JOIN public.clients c ON c.id = a.client_id`,
      workspaceId, nutritionistUserId, apptId, meetingUrlFor('video'),
    );
    if (!row) throw new NotFoundException('Appointment not found or not awaiting approval.');
    void this.notifications.notifyClient(workspaceId, row.client_id, {
      type: 'appointment:approved',
      title: '✅ Appointment confirmed',
      body: `Your ${labelForKind(row.kind).toLowerCase()} on ${formatWhen(row.scheduled_at)} is confirmed.`,
      url: '/portal/appointments', tag: `appt-${row.id}`,
    });
    return row;
  }

  /**
   * Decline a client-requested appointment: pending -> declined, with an
   * optional reason the client sees. Notifies the client.
   */
  async declineWorkspaceAppointment(workspaceId: string, nutritionistUserId: string, apptId: string, reason?: string): Promise<WorkspaceAppointment> {
    const [row] = await this.prisma.$queryRawUnsafe<WorkspaceAppointment[]>(
      `WITH upd AS (
         UPDATE public.appointments
            SET status = 'declined', cancelled_at = now(), cancelled_by = $2::uuid, cancel_reason = $4
          WHERE workspace_id = $1::uuid AND id = $3::uuid AND status = 'pending'
          RETURNING *)
       SELECT ${this.APPT_SELECT} FROM upd a JOIN public.clients c ON c.id = a.client_id`,
      workspaceId, nutritionistUserId, apptId, reason ?? null,
    );
    if (!row) throw new NotFoundException('Appointment not found or not awaiting approval.');
    void this.notifications.notifyClient(workspaceId, row.client_id, {
      type: 'appointment:declined',
      title: 'Appointment request declined',
      body: `Your ${labelForKind(row.kind).toLowerCase()} request for ${formatWhen(row.scheduled_at)} wasn't confirmed.${reason ? ` Reason: ${reason}` : ''}`,
      url: '/portal/appointments', tag: `appt-${row.id}`,
    });
    return row;
  }

  // ── Meeting join config (embedded video) ──
  // Free by default on the public Jitsi server. If JaaS env vars are present
  // (JITSI_JAAS_APP_ID / JITSI_JAAS_KID / JITSI_JAAS_PRIVATE_KEY) we upgrade to
  // 8x8-hosted Jitsi with a signed token — no first-joiner sign-in prompt.

  async workspaceMeetingConfig(workspaceId: string, apptId: string, user: { id: string; email?: string }): Promise<MeetingJoin> {
    const a = await this.getWorkspaceAppointment(workspaceId, apptId);
    return this.buildMeetingJoin(a, a.client_name, true, user);
  }
  async myMeetingConfig(userId: string, apptId: string, user: { id: string; email?: string }): Promise<MeetingJoin> {
    const a = await this.getMyAppointment(userId, apptId);
    return this.buildMeetingJoin(a, null, false, user);
  }

  private async buildMeetingJoin(
    appt: { scheduled_at: string; duration_minutes: number; kind: string; mode: string; status: string; meeting_url: string | null },
    otherName: string | null,
    moderator: boolean,
    user: { id: string; email?: string },
  ): Promise<MeetingJoin> {
    const base = {
      mode: appt.mode, status: appt.status, scheduled_at: appt.scheduled_at,
      duration_minutes: appt.duration_minutes, kind: appt.kind, other_name: otherName,
    };
    const room0 = roomFromUrl(appt.meeting_url);

    // ── Daily.co (preferred when DAILY_API_KEY is set) ──
    // Real video API: reliable, no "wait for moderator", own subdomain.
    const dailyKey = process.env.DAILY_API_KEY;
    if (room0 && dailyKey && appt.mode === 'video') {
      try {
        const d = await this.buildDailyJoin(dailyKey, room0, moderator, user, appt);
        return { provider: 'daily', ...d, ...base };
      } catch (err) {
        this.logger.warn(`Daily.co join failed, falling back to Jitsi: ${err}`);
      }
    }

    // ── Jitsi (public free by default; JaaS/8x8 when its env vars are present) ──
    let room = room0;
    let domain = 'meet.jit.si';
    let jwt: string | null = null;

    const appId = process.env.JITSI_JAAS_APP_ID;
    const kid = process.env.JITSI_JAAS_KID;
    const pem = process.env.JITSI_JAAS_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (room && appId && kid && pem) {
      try {
        const key = await importPKCS8(pem, 'RS256');
        const name = (user.email ?? 'Guest').split('@')[0];
        jwt = await new SignJWT({
          aud: 'jitsi', iss: 'chat', sub: appId, room,
          context: { user: { id: user.id, name, email: user.email ?? undefined, moderator: moderator ? 'true' : 'false' } },
        })
          .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
          .setIssuedAt()
          .setNotBefore('-10s')
          .setExpirationTime('3h')
          .sign(key);
        domain = '8x8.vc';
        room = `${appId}/${room}`;
      } catch (err) {
        this.logger.warn(`JaaS token signing failed, falling back to public Jitsi: ${err}`);
      }
    }

    return { provider: 'jitsi', domain, room: room ?? '', room_url: null, jwt, ...base };
  }

  // Daily.co: idempotently ensure a private room for this appointment, then mint
  // a short-lived meeting token (owner = moderator). Room/token expire a little
  // after the appointment ends. All via the REST API — only DAILY_API_KEY needed.
  private async buildDailyJoin(
    apiKey: string,
    room0: string,
    moderator: boolean,
    user: { id: string; email?: string },
    appt: { scheduled_at: string; duration_minutes: number },
  ): Promise<{ domain: string; room: string; room_url: string; jwt: string }> {
    const name = `sirah-${room0.toLowerCase().replace(/[^a-z0-9-]/g, '')}`.slice(0, 60);
    const startMs = new Date(appt.scheduled_at).getTime();
    const endExp = Number.isFinite(startMs)
      ? Math.floor((startMs + (appt.duration_minutes + 30) * 60_000) / 1000)
      : 0;
    const exp = Math.max(endExp, Math.floor(Date.now() / 1000) + 3 * 60 * 60); // ≥ 3h ahead

    const url = await this.ensureDailyRoom(apiKey, name, exp);

    const userName = (user.email ?? 'Guest').split('@')[0];
    const res = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: { room_name: name, is_owner: moderator, user_name: userName, exp },
      }),
    });
    if (!res.ok) throw new Error(`meeting-token ${res.status}: ${await res.text()}`);
    const tok = (await res.json()) as { token: string };

    let domain = 'daily.co';
    try { domain = new URL(url).host; } catch { /* keep default */ }
    return { domain, room: name, room_url: url, jwt: tok.token };
  }

  private async ensureDailyRoom(apiKey: string, name: string, exp: number): Promise<string> {
    const auth = { Authorization: `Bearer ${apiKey}` };
    const got = await fetch(`https://api.daily.co/v1/rooms/${name}`, { headers: auth });
    if (got.ok) return ((await got.json()) as { url: string }).url;

    const created = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        privacy: 'private',
        properties: { exp, eject_at_room_exp: true, enable_prejoin_ui: false },
      }),
    });
    if (created.ok) return ((await created.json()) as { url: string }).url;

    // Lost a create race? Re-fetch before giving up.
    const retry = await fetch(`https://api.daily.co/v1/rooms/${name}`, { headers: auth });
    if (retry.ok) return ((await retry.json()) as { url: string }).url;
    throw new Error(`room create ${created.status}: ${await created.text()}`);
  }

  // ─────────────────────────────────────────────────────────────────
  // Body measurements
  // ─────────────────────────────────────────────────────────────────

  async myMeasurements(userId: string, limit = 30): Promise<Measurement[]> {
    const me = await this.myClientId(userId);
    const lim = clamp(limit, 1, 200);
    return this.prisma.$queryRawUnsafe<Measurement[]>(
      `SELECT id, recorded_at,
              arm_inches::float    AS arm_inches,
              chest_inches::float  AS chest_inches,
              waist_inches::float  AS waist_inches,
              hip_inches::float    AS hip_inches,
              thigh_inches::float  AS thigh_inches,
              notes
         FROM public.client_measurements
        WHERE client_id = $1::uuid
        ORDER BY recorded_at DESC
        LIMIT $2`,
      me,
      lim,
    );
  }

  async logMeasurement(
    userId: string,
    body: Partial<{
      arm_inches: number; chest_inches: number; waist_inches: number;
      hip_inches: number; thigh_inches: number; notes: string;
      recorded_at: string;
    }>,
  ): Promise<Measurement> {
    const me = await this.myClientId(userId);
    // Reject empty submissions — every field is optional but at least one must be set.
    const measureFields = [
      body.arm_inches, body.chest_inches, body.waist_inches,
      body.hip_inches, body.thigh_inches,
    ];
    if (measureFields.every((v) => v == null)) {
      throw new BadRequestException('Provide at least one measurement.');
    }
    const recordedAt = body.recorded_at
      ? new Date(body.recorded_at)
      : new Date();
    if (Number.isNaN(recordedAt.getTime())) {
      throw new BadRequestException('recorded_at must be a valid ISO timestamp.');
    }

    const [row] = await this.prisma.$queryRawUnsafe<Measurement[]>(
      `INSERT INTO public.client_measurements
         (client_id, recorded_at, arm_inches, chest_inches, waist_inches, hip_inches, thigh_inches, notes)
       VALUES ($1::uuid, $2::timestamptz,
               $3::numeric, $4::numeric, $5::numeric, $6::numeric, $7::numeric, $8)
       RETURNING id, recorded_at,
                 arm_inches::float    AS arm_inches,
                 chest_inches::float  AS chest_inches,
                 waist_inches::float  AS waist_inches,
                 hip_inches::float    AS hip_inches,
                 thigh_inches::float  AS thigh_inches,
                 notes`,
      me,
      recordedAt.toISOString(),
      body.arm_inches    ?? null,
      body.chest_inches  ?? null,
      body.waist_inches  ?? null,
      body.hip_inches    ?? null,
      body.thigh_inches  ?? null,
      body.notes?.slice(0, 500) ?? null,
    );
    return row;
  }

  async deleteMeasurement(userId: string, id: string): Promise<{ deleted: true }> {
    const me = await this.myClientId(userId);
    const result = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `DELETE FROM public.client_measurements
        WHERE id = $1::uuid AND client_id = $2::uuid
       RETURNING id`,
      id,
      me,
    );
    if (!result.length) throw new NotFoundException('Measurement not found.');
    return { deleted: true };
  }

  // ─────────────────────────────────────────────────────────────────
  // Assessment review cards — read-only for the client side
  //
  // The card lives in `pending_review_cards`. Cards become visible to the
  // client only when status = 'sent'. The form_responses JSONB is where
  // the client's answers land; until they fill it in we treat the card
  // as a notification to act on.
  // ─────────────────────────────────────────────────────────────────

  async myAssessmentCards(userId: string): Promise<AssessmentCard[]> {
    const me = await this.myClientId(userId);
    return this.prisma.$queryRawUnsafe<AssessmentCard[]>(
      `SELECT id, card_type, generated_content, status, workflow_stage,
              sent_at, reviewed_at, notes, created_at,
              -- piggy-back: did the client respond yet?
              (generated_content ? 'client_responses') AS has_responses
         FROM public.pending_review_cards
        WHERE client_id = $1::uuid AND status = 'sent'
        ORDER BY sent_at DESC NULLS LAST, created_at DESC
        LIMIT 100`,
      me,
    );
  }

  /**
   * Submit answers on an assessment card. We don't have a dedicated responses
   * column — we patch `generated_content -> client_responses` instead, which
   * keeps everything in one JSONB tree the nutritionist can read.
   */
  async submitAssessmentResponse(
    userId: string,
    cardId: string,
    responses: Record<string, unknown>,
  ): Promise<AssessmentCard> {
    const me = await this.myClientId(userId);
    if (!responses || typeof responses !== 'object') {
      throw new BadRequestException('responses must be an object.');
    }
    // Load the definition so we can auto-generate a report from the answers.
    const [card] = await this.prisma.$queryRawUnsafe<Array<{ generated_content: unknown }>>(
      `SELECT generated_content FROM public.pending_review_cards
        WHERE id = $1::uuid AND client_id = $2::uuid AND status = 'sent' LIMIT 1`,
      cardId,
      me,
    );
    if (!card) throw new NotFoundException('Assessment card not found or not yours.');
    const report = buildAssessmentReport(card.generated_content, responses as Record<string, unknown>);

    const [row] = await this.prisma.$queryRawUnsafe<AssessmentCard[]>(
      `UPDATE public.pending_review_cards
          SET generated_content = jsonb_set(
                jsonb_set(
                  COALESCE(generated_content, '{}'::jsonb),
                  '{client_responses}', $3::jsonb, true
                ),
                '{report}', $4::jsonb, true
              ),
              updated_at = now()
        WHERE id = $1::uuid AND client_id = $2::uuid AND status = 'sent'
       RETURNING id, card_type, generated_content, status, workflow_stage,
                 sent_at, reviewed_at, notes, created_at,
                 (generated_content ? 'client_responses') AS has_responses`,
      cardId,
      me,
      JSON.stringify(responses),
      JSON.stringify(report),
    );
    if (!row) throw new NotFoundException('Assessment card not found or not yours.');
    return row;
  }

  // ─────────────────────────────────────────────────────────────────
  // Assessment assignment — nutritionist (owner) side
  //
  // The owner assigns a built-in Health / Stress / Sleep assessment to a
  // client. We materialise the template into a pending_review_cards row with
  // status='sent' so it appears in the client's portal immediately.
  // ─────────────────────────────────────────────────────────────────

  /** List a client's assessment cards (any status) for the nutritionist to review. */
  async listClientAssessments(workspaceId: string, clientId: string): Promise<AssessmentCard[]> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    return this.prisma.$queryRawUnsafe<AssessmentCard[]>(
      `SELECT id, card_type, generated_content, status, workflow_stage,
              sent_at, reviewed_at, notes, created_at,
              (generated_content ? 'client_responses') AS has_responses
         FROM public.pending_review_cards
        WHERE client_id = $1::uuid AND workspace_id = $2::uuid
        ORDER BY created_at DESC
        LIMIT 100`,
      clientId,
      workspaceId,
    );
  }

  /**
   * Recently completed assessments across the whole workspace — powers the
   * owner dashboard's "assessments to review" feed. Only cards the client has
   * actually answered (client_responses present), most recent submission first.
   */
  async recentCompletedAssessments(
    workspaceId: string,
    limit = 6,
  ): Promise<Array<{
    id: string;
    client_id: string;
    client_name: string;
    card_type: string;
    title: string | null;
    score: number | null;
    band: string | null;
    submitted_at: string;
  }>> {
    const n = Math.min(20, Math.max(1, Math.round(Number(limit) || 6)));
    return this.prisma.$queryRawUnsafe(
      `SELECT prc.id,
              prc.client_id,
              COALESCE(NULLIF(c.display_name, ''), c.name, 'Client') AS client_name,
              prc.card_type,
              (prc.generated_content ->> 'title') AS title,
              NULLIF(prc.generated_content #>> '{report,score}', '')::int AS score,
              (prc.generated_content #>> '{report,band}') AS band,
              COALESCE(prc.updated_at, prc.sent_at, prc.created_at) AS submitted_at
         FROM public.pending_review_cards prc
         JOIN public.clients c ON c.id = prc.client_id
        WHERE prc.workspace_id = $1::uuid
          AND (prc.generated_content ? 'client_responses')
        ORDER BY COALESCE(prc.updated_at, prc.sent_at, prc.created_at) DESC
        LIMIT $2`,
      workspaceId,
      n,
    );
  }

  /**
   * Nutritionist marks a client's assessment as reviewed, with an optional
   * note the client will see on their portal. Stores { note, reviewed_at }
   * under generated_content.review and stamps the reviewed_at column.
   */
  async reviewClientAssessment(
    workspaceId: string,
    clientId: string,
    cardId: string,
    note: string | null,
  ): Promise<AssessmentCard> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    const trimmed = note?.trim() ? note.trim().slice(0, 2000) : null;
    const review = { note: trimmed, reviewed_at: new Date().toISOString() };
    const [row] = await this.prisma.$queryRawUnsafe<AssessmentCard[]>(
      `UPDATE public.pending_review_cards
          SET generated_content = jsonb_set(COALESCE(generated_content, '{}'::jsonb), '{review}', $4::jsonb, true),
              reviewed_at = now(),
              updated_at = now()
        WHERE id = $1::uuid AND client_id = $2::uuid AND workspace_id = $3::uuid
       RETURNING id, card_type, generated_content, status, workflow_stage,
                 sent_at, reviewed_at, notes, created_at,
                 (generated_content ? 'client_responses') AS has_responses`,
      cardId,
      clientId,
      workspaceId,
      JSON.stringify(review),
    );
    if (!row) throw new NotFoundException('Assessment card not found.');
    return row;
  }

  /**
   * Assign an assessment to a client — either a built-in type (health / stress /
   * sleep) or a workspace-authored custom form (via templateId). Materialises it
   * into a sent pending_review_cards row so it appears in the client portal.
   */
  async assignAssessment(
    workspaceId: string,
    clientId: string,
    opts: { type?: AssessmentType; templateId?: string },
  ): Promise<AssessmentCard> {
    await this.assertClientInWorkspace(workspaceId, clientId);

    let cardType: string;
    let content: unknown;
    let templateId: string | null = null;

    if (opts.templateId) {
      const [tpl] = await this.prisma.$queryRawUnsafe<Array<{ name: string; description: string | null; questions: unknown; status: string }>>(
        `SELECT name, description, questions, status FROM public.assessment_form_templates
          WHERE id = $1::uuid AND workspace_id = $2::uuid AND archived = false LIMIT 1`,
        opts.templateId,
        workspaceId,
      );
      if (!tpl) throw new NotFoundException('Assessment form not found.');
      if (tpl.status === 'draft') throw new BadRequestException('Publish this form before sending it to clients.');
      cardType = 'custom_form';
      templateId = opts.templateId;
      content = {
        title: tpl.name,
        intro: tpl.description ?? '',
        questions: Array.isArray(tpl.questions) ? tpl.questions : [],
      };
    } else {
      const type = opts.type;
      if (!type || !['health', 'stress', 'sleep'].includes(type)) {
        throw new BadRequestException('Provide a built-in type (health|stress|sleep) or a templateId.');
      }
      const built = buildAssessmentContent(type);
      cardType = built.card_type;
      content = built.content;
    }

    const [row] = await this.prisma.$queryRawUnsafe<AssessmentCard[]>(
      `INSERT INTO public.pending_review_cards
         (client_id, card_type, generated_content, status, workflow_stage, sent_at, workspace_id, template_id)
       VALUES ($1::uuid, $2, $3::jsonb, 'sent', 'sent', now(), $4::uuid, $5::uuid)
       RETURNING id, card_type, generated_content, status, workflow_stage,
                 sent_at, reviewed_at, notes, created_at,
                 (generated_content ? 'client_responses') AS has_responses`,
      clientId,
      cardType,
      JSON.stringify(content),
      workspaceId,
      templateId,
    );
    return row;
  }

  // ─────────────────────────────────────────────────────────────────
  // Custom assessment forms — workspace-authored, reusable definitions.
  // ─────────────────────────────────────────────────────────────────

  /** List the workspace's custom assessment forms (newest first). */
  async listAssessmentForms(workspaceId: string): Promise<AssessmentForm[]> {
    return this.prisma.$queryRawUnsafe<AssessmentForm[]>(
      `SELECT id, name, description, questions, status, created_at, updated_at
         FROM public.assessment_form_templates
        WHERE workspace_id = $1::uuid AND archived = false
        ORDER BY updated_at DESC
        LIMIT 200`,
      workspaceId,
    );
  }

  /** Create a custom assessment form. */
  async createAssessmentForm(
    workspaceId: string,
    userId: string,
    dto: { name: string; description?: string; questions: TemplateQuestion[]; status?: 'draft' | 'published' },
  ): Promise<AssessmentForm> {
    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException('name is required.');
    if (!Array.isArray(dto.questions) || dto.questions.length === 0) {
      throw new BadRequestException('At least one question is required.');
    }
    const status = dto.status === 'draft' ? 'draft' : 'published';
    const [row] = await this.prisma.$queryRawUnsafe<AssessmentForm[]>(
      `INSERT INTO public.assessment_form_templates (workspace_id, name, description, questions, status, created_by)
       VALUES ($1::uuid, $2, $3, $4::jsonb, $5, $6::uuid)
       RETURNING id, name, description, questions, status, created_at, updated_at`,
      workspaceId,
      name,
      dto.description?.trim() || null,
      JSON.stringify(dto.questions),
      status,
      userId,
    );
    return row;
  }

  /** Update a custom assessment form's name, description, and questions. */
  async updateAssessmentForm(
    workspaceId: string,
    id: string,
    dto: { name: string; description?: string; questions: TemplateQuestion[]; status?: 'draft' | 'published' },
  ): Promise<AssessmentForm> {
    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException('name is required.');
    if (!Array.isArray(dto.questions) || dto.questions.length === 0) {
      throw new BadRequestException('At least one question is required.');
    }
    // When status is omitted, keep the existing value (COALESCE against the new).
    const status = dto.status === 'draft' || dto.status === 'published' ? dto.status : null;
    const [row] = await this.prisma.$queryRawUnsafe<AssessmentForm[]>(
      `UPDATE public.assessment_form_templates
          SET name = $3, description = $4, questions = $5::jsonb,
              status = COALESCE($6, status), updated_at = now()
        WHERE id = $1::uuid AND workspace_id = $2::uuid AND archived = false
       RETURNING id, name, description, questions, status, created_at, updated_at`,
      id,
      workspaceId,
      name,
      dto.description?.trim() || null,
      JSON.stringify(dto.questions),
      status,
    );
    if (!row) throw new NotFoundException('Assessment form not found.');
    return row;
  }

  /**
   * Copy a starter form from the built-in library into this workspace as an
   * ordinary, fully-editable form.
   *
   * Installed as a DRAFT on purpose: these are long clinical intakes, and the
   * owner should review the wording (and strip anything their practice doesn't
   * ask) before it can be sent — assignAssessment already refuses drafts.
   *
   * Re-installing is allowed and creates a second copy rather than overwriting:
   * the first copy may have been edited, and silently clobbering that work
   * would be worse than a duplicate the owner can delete.
   */
  async installStarterForm(
    workspaceId: string,
    userId: string,
    key: string,
  ): Promise<AssessmentForm> {
    const starter = starterFormByKey(key);
    if (!starter) throw new NotFoundException(`Unknown starter form '${key}'.`);

    const existing = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n
         FROM public.assessment_form_templates
        WHERE workspace_id = $1::uuid AND archived = false AND name LIKE $2`,
      workspaceId,
      `${starter.name}%`,
    );
    // "General Nutritional Assessment", then "… (2)", "… (3)" — so a second
    // install is obviously a copy in the list rather than an identical twin.
    const n = Number(existing[0]?.n ?? 0);
    const name = n === 0 ? starter.name : `${starter.name} (${n + 1})`;

    return this.createAssessmentForm(workspaceId, userId, {
      name,
      description: starter.description,
      questions: starter.questions,
      status: 'draft',
    });
  }

  /** The starter forms on offer, for the owner's "install" picker. */
  listStarterForms(): Array<{ key: string; name: string; description: string; fieldCount: number }> {
    return STARTER_FORMS.map((f) => ({
      key: f.key,
      name: f.name,
      description: f.description,
      fieldCount: f.questions.filter((q) => q.type !== 'section').length,
    }));
  }

  /** Archive (soft-delete) a custom assessment form. */
  async deleteAssessmentForm(workspaceId: string, id: string): Promise<{ id: string }> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE public.assessment_form_templates
          SET archived = true, updated_at = now()
        WHERE id = $1::uuid AND workspace_id = $2::uuid
       RETURNING id`,
      id,
      workspaceId,
    );
    if (!row) throw new NotFoundException('Assessment form not found.');
    return { id: row.id };
  }

  // ─────────────────────────────────────────────────────────────────
  // Recipe library — read-only for clients. The nutritionist UI manages
  // CRUD; the client just consumes.
  // ─────────────────────────────────────────────────────────────────

  /** Resolve the caller's workspace from their client profile. */
  private async myWorkspaceId(userId: string): Promise<string> {
    const [c] = await this.prisma.$queryRawUnsafe<Array<{ workspace_id: string }>>(
      `SELECT workspace_id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`, userId);
    if (!c) throw new NotFoundException('No client profile linked to this user.');
    return c.workspace_id;
  }

  /**
   * Client recipe library = the nutritionist's PUBLISHED workspace recipes,
   * scoped to the caller's workspace. Drafts are never exposed. `cuisine` maps
   * to the recipe's category. Delegates to WorkspaceRecipesService so nutrition
   * matches exactly what the nutritionist sees (same engine).
   */
  async listRecipes(userId: string, params: { q?: string; cuisine?: string; limit?: number } = {}): Promise<RecipeListItem[]> {
    const workspaceId = await this.myWorkspaceId(userId);
    const items = await this.workspaceRecipes.list(workspaceId, { search: params.q, includeDrafts: false });
    const cuisine = params.cuisine?.trim().toLowerCase();
    const limit = clamp(params.limit ?? 50, 1, 200);
    return items
      .filter((r) => !cuisine || (r.category ?? '').toLowerCase() === cuisine)
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        servings: r.servings,
        // List uses the fast per-serving estimate × servings → whole-recipe kcal.
        total_kcal: r.kcal_per_serving_estimate == null ? null : Math.round(r.kcal_per_serving_estimate * r.servings),
        video_url: null,
      }));
  }

  async listCuisines(userId: string): Promise<string[]> {
    const workspaceId = await this.myWorkspaceId(userId);
    const rows = await this.prisma.$queryRawUnsafe<Array<{ category: string }>>(
      `SELECT DISTINCT category FROM public.workspace_recipes
        WHERE workspace_id = $1::uuid AND is_published = true
          AND category IS NOT NULL AND category <> ''
        ORDER BY category`,
      workspaceId);
    return rows.map((r) => r.category);
  }

  async getRecipe(userId: string, id: string): Promise<RecipeDetail> {
    const workspaceId = await this.myWorkspaceId(userId);
    // Guard: clients only ever see PUBLISHED recipes in their own workspace.
    const [pub] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.workspace_recipes
        WHERE id = $1::uuid AND workspace_id = $2::uuid AND is_published = true LIMIT 1`,
      id, workspaceId);
    if (!pub) throw new NotFoundException('Recipe not found.');

    const full = await this.workspaceRecipes.getWithNutrition(workspaceId, id, userId);
    return {
      id: full.recipe.id,
      name: full.recipe.name,
      description: full.recipe.description,
      category: full.recipe.category,
      servings: full.recipe.servings,
      total_kcal: full.totals.per_recipe.energy_kcal ?? null,
      video_url: null,
      instructions: full.recipe.instructions,
      ingredients: full.ingredients.map((ing) => ({
        id: ing.id,
        ingredient_id: ing.food_id,
        name: ing.food?.canonical_name ?? 'Ingredient',
        quantity: ing.quantity_g,
        unit: 'g',
        kcal_per_serving: ing.nutrition.energy_kcal ?? 0,
        protein: ing.nutrition.protein_g ?? null,
        carbs: ing.nutrition.carbohydrate_g ?? null,
        fats: ing.nutrition.fat_g ?? null,
      })),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // File vault — list + sign download URLs. Files live in the
  // `client-files` Supabase storage bucket. The DB stores the bucket key
  // in `file_url`; we sign it on demand for downloads.
  // ─────────────────────────────────────────────────────────────────

  async myFiles(userId: string): Promise<FileItem[]> {
    const me = await this.myClientId(userId);
    return this.prisma.$queryRawUnsafe<FileItem[]>(
      `SELECT id, file_name, file_url, file_type, file_size, uploaded_by, created_at
         FROM public.files
        WHERE client_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT 200`,
      me,
    );
  }

  /**
   * Issue a signed upload URL the client can PUT a file to directly, then call
   * addMyFile with the returned storage_key. Files land in a per-client folder
   * of the `client-files` bucket so signed downloads can't traverse.
   */
  async createFileUploadTicket(
    userId: string,
    fileName: string,
  ): Promise<{ uploadUrl: string; storageKey: string; token: string }> {
    const me = await this.myClientId(userId);
    return this.createUploadTicket('client-files', this.buildFileKey(me, fileName));
  }

  /** Record a client-uploaded file after the browser PUT to storage succeeds. */
  async addMyFile(
    userId: string,
    body: { storage_key: string; file_name: string; file_type?: string; file_size?: number },
  ): Promise<FileItem> {
    const me = await this.myClientId(userId);
    return this.insertFileRow(me, body, 'client');
  }

  /** Client deletes one of their OWN uploads (never a nutritionist-shared file). */
  async deleteMyFile(userId: string, fileId: string): Promise<{ deleted: true }> {
    const me = await this.myClientId(userId);
    const r = await this.prisma.$queryRawUnsafe<Array<{ file_url: string }>>(
      `DELETE FROM public.files
        WHERE id = $1::uuid AND client_id = $2::uuid AND uploaded_by = 'client'
       RETURNING file_url`,
      fileId, me,
    );
    if (!r.length) throw new NotFoundException('File not found, or not one you can delete.');
    void this.deleteFromStorage('client-files', this.storageKeyOf(r[0].file_url))
      .catch((err) => this.logger.warn(`Could not remove storage object: ${err}`));
    return { deleted: true };
  }

  // ── Nutritionist (workspace) side of the same file vault ──

  async workspaceClientFiles(workspaceId: string, clientId: string): Promise<FileItem[]> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    return this.prisma.$queryRawUnsafe<FileItem[]>(
      `SELECT id, file_name, file_url, file_type, file_size, uploaded_by, created_at
         FROM public.files
        WHERE client_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT 200`,
      clientId,
    );
  }

  async signWorkspaceClientFile(
    workspaceId: string,
    clientId: string,
    fileId: string,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    const [file] = await this.prisma.$queryRawUnsafe<Array<{ file_url: string }>>(
      `SELECT file_url FROM public.files WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1`,
      fileId, clientId,
    );
    if (!file) throw new NotFoundException('File not found.');
    return this.signStorageObject('client-files', this.storageKeyOf(file.file_url));
  }

  async createWorkspaceFileUploadTicket(
    workspaceId: string,
    clientId: string,
    fileName: string,
  ): Promise<{ uploadUrl: string; storageKey: string; token: string }> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    return this.createUploadTicket('client-files', this.buildFileKey(clientId, fileName));
  }

  /** Nutritionist shares a file with the client (uploaded_by = 'workspace'). */
  async addWorkspaceClientFile(
    workspaceId: string,
    clientId: string,
    body: { storage_key: string; file_name: string; file_type?: string; file_size?: number },
  ): Promise<FileItem> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    return this.insertFileRow(clientId, body, 'workspace');
  }

  async deleteWorkspaceClientFile(
    workspaceId: string,
    clientId: string,
    fileId: string,
  ): Promise<{ deleted: true }> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    const r = await this.prisma.$queryRawUnsafe<Array<{ file_url: string }>>(
      `DELETE FROM public.files
        WHERE id = $1::uuid AND client_id = $2::uuid
       RETURNING file_url`,
      fileId, clientId,
    );
    if (!r.length) throw new NotFoundException('File not found.');
    void this.deleteFromStorage('client-files', this.storageKeyOf(r[0].file_url))
      .catch((err) => this.logger.warn(`Could not remove storage object: ${err}`));
    return { deleted: true };
  }

  // ── File-vault internals shared by both sides ──

  private buildFileKey(clientId: string, fileName: string): string {
    const safe = (fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
    return `${clientId}/${Date.now()}-${randomBytes(6).toString('hex')}-${safe}`;
  }

  /** Strip a full URL / bucket prefix down to the bare storage object key. */
  private storageKeyOf(fileUrl: string): string {
    return fileUrl
      .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/[^/]+\//, '')
      .replace(/^client-files\//, '');
  }

  private async insertFileRow(
    clientId: string,
    body: { storage_key: string; file_name: string; file_type?: string; file_size?: number },
    uploadedBy: 'client' | 'workspace',
  ): Promise<FileItem> {
    const name = (body.file_name || '').trim();
    if (!name) throw new BadRequestException('A file name is required.');
    if (!body.storage_key) throw new BadRequestException('storage_key is required.');
    // Plan storage cap. The browser has already PUT the bytes to the bucket via
    // a signed upload, so if the workspace is over quota we delete that orphaned
    // object before surfacing the 402 (rather than leaking untracked storage).
    const size = Number(body.file_size ?? 0);
    if (size > 0) {
      const [c] = await this.prisma.$queryRawUnsafe<Array<{ workspace_id: string | null }>>(
        `SELECT workspace_id FROM public.clients WHERE id = $1::uuid LIMIT 1`,
        clientId,
      );
      if (c?.workspace_id) {
        try {
          await this.limits.assertStorageQuota(c.workspace_id, size);
        } catch (err) {
          void this.deleteFromStorage('client-files', this.storageKeyOf(body.storage_key))
            .catch((e) => this.logger.warn(`Orphan cleanup failed after storage-cap reject: ${e}`));
          throw err;
        }
      }
    }
    const [row] = await this.prisma.$queryRawUnsafe<FileItem[]>(
      `INSERT INTO public.files (client_id, file_name, file_url, file_type, file_size, uploaded_by)
       VALUES ($1::uuid, $2, $3, $4, $5::int, $6)
       RETURNING id, file_name, file_url, file_type, file_size, uploaded_by, created_at`,
      clientId,
      name.slice(0, 255),
      body.storage_key,
      body.file_type ?? null,
      body.file_size ?? null,
      uploadedBy,
    );
    return row;
  }

  private async createUploadTicket(
    bucket: string,
    key: string,
  ): Promise<{ uploadUrl: string; storageKey: string; token: string }> {
    const supabaseUrl = this.config.getOrThrow<string>('SUPABASE_URL').trim();
    const serviceKey  = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY').trim();
    const resp = await fetch(
      `${supabaseUrl}/storage/v1/object/upload/sign/${bucket}/${key}`,
      { method: 'POST', headers: { 'Authorization': `Bearer ${serviceKey}` } },
    );
    if (!resp.ok) {
      const text = await resp.text();
      this.logger.warn(`Sign upload failed: ${resp.status} ${text}`);
      throw new BadRequestException('Could not prepare upload.');
    }
    const json = (await resp.json()) as { url?: string; token?: string };
    if (!json.url || !json.token) {
      throw new BadRequestException('Storage did not return a signed upload URL.');
    }
    const fullUrl = json.url.startsWith('http')
      ? json.url
      : `${supabaseUrl}/storage/v1${json.url.startsWith('/') ? '' : '/'}${json.url}`;
    return { uploadUrl: fullUrl, storageKey: key, token: json.token };
  }

  // ─────────────────────────────────────────────────────────────────
  // Nutritionist private notes on a client (admin_notes table)
  // ─────────────────────────────────────────────────────────────────

  async listClientNotes(workspaceId: string, clientId: string): Promise<ClientNote[]> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    return this.prisma.$queryRawUnsafe<ClientNote[]>(
      `SELECT id, content, admin_id, created_at, updated_at
         FROM public.admin_notes
        WHERE client_id = $1::uuid AND workspace_id = $2::uuid
        ORDER BY created_at DESC
        LIMIT 200`,
      clientId, workspaceId,
    );
  }

  async createClientNote(
    workspaceId: string,
    adminId: string,
    clientId: string,
    content: string,
  ): Promise<ClientNote> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    const body = (content || '').trim();
    if (!body) throw new BadRequestException('Note cannot be empty.');
    if (body.length > 5000) throw new BadRequestException('Note is too long (5000 chars max).');
    const [row] = await this.prisma.$queryRawUnsafe<ClientNote[]>(
      `INSERT INTO public.admin_notes (client_id, admin_id, content, workspace_id)
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid)
       RETURNING id, content, admin_id, created_at, updated_at`,
      clientId, adminId, body, workspaceId,
    );
    return row;
  }

  async updateClientNote(
    workspaceId: string,
    clientId: string,
    noteId: string,
    content: string,
  ): Promise<ClientNote> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    const body = (content || '').trim();
    if (!body) throw new BadRequestException('Note cannot be empty.');
    if (body.length > 5000) throw new BadRequestException('Note is too long (5000 chars max).');
    const r = await this.prisma.$queryRawUnsafe<ClientNote[]>(
      `UPDATE public.admin_notes
          SET content = $1, updated_at = now()
        WHERE id = $2::uuid AND client_id = $3::uuid AND workspace_id = $4::uuid
       RETURNING id, content, admin_id, created_at, updated_at`,
      body, noteId, clientId, workspaceId,
    );
    if (!r.length) throw new NotFoundException('Note not found.');
    return r[0];
  }

  async deleteClientNote(
    workspaceId: string,
    clientId: string,
    noteId: string,
  ): Promise<{ deleted: true }> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    const r = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `DELETE FROM public.admin_notes
        WHERE id = $1::uuid AND client_id = $2::uuid AND workspace_id = $3::uuid
       RETURNING id`,
      noteId, clientId, workspaceId,
    );
    if (!r.length) throw new NotFoundException('Note not found.');
    return { deleted: true };
  }

  /**
   * Sign a download URL for the client's file. Returns a short-lived URL
   * the browser can fetch directly. We verify ownership first so a client
   * can't ask for a sibling's file by guessing the id.
   */
  async signFileDownload(userId: string, fileId: string): Promise<{ url: string; expiresInSeconds: number }> {
    const me = await this.myClientId(userId);
    const [file] = await this.prisma.$queryRawUnsafe<Array<{ file_url: string; file_name: string }>>(
      `SELECT file_url, file_name FROM public.files
        WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1`,
      fileId,
      me,
    );
    if (!file) throw new NotFoundException('File not found or not yours.');

    const expiresInSeconds = 60 * 10; // 10 minutes - plenty for one download.
    const supabaseUrl       = this.config.getOrThrow<string>('SUPABASE_URL').trim();
    const supabaseServiceKey = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY').trim();

    // The `file_url` column historically stored either the bucket key or a
    // full URL. Strip a leading bucket name if present.
    const objectPath = file.file_url
      .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/[^/]+\//, '')
      .replace(/^client-files\//, '');

    const resp = await fetch(
      `${supabaseUrl}/storage/v1/object/sign/client-files/${objectPath}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      },
    );
    if (!resp.ok) {
      const text = await resp.text();
      this.logger.warn(`Sign URL failed for ${objectPath}: ${resp.status} ${text}`);
      throw new BadRequestException('Could not sign file URL. The file may be missing in storage.');
    }
    const json = (await resp.json()) as { signedURL?: string; signedUrl?: string };
    const signedPath = json.signedURL ?? json.signedUrl;
    if (!signedPath) {
      throw new BadRequestException('Storage did not return a signed URL.');
    }
    return {
      url: `${supabaseUrl}/storage/v1${signedPath.startsWith('/') ? '' : '/'}${signedPath}`,
      expiresInSeconds,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Workspace-admin messaging — list conversations + load thread
  // ─────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────
  // Workspace-admin → drill into one client's data
  // RLS doesn't protect us here because the JWT belongs to the admin, not
  // the client. We enforce workspace_id ownership in each query directly.
  // ─────────────────────────────────────────────────────────────────

  private async assertClientInWorkspace(workspaceId: string, clientId: string): Promise<void> {
    const [r] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients
        WHERE id = $1::uuid AND workspace_id = $2::uuid
        LIMIT 1`,
      clientId,
      workspaceId,
    );
    if (!r) throw new NotFoundException('Client not in this workspace.');
  }

  async workspaceClientMeals(workspaceId: string, clientId: string, days = 30): Promise<Array<{
    id: string;
    meal_type: string;
    meal_name: string | null;
    kcal: number | null;
    detected_name: string | null;
    cooking_method: string | null;
    ai_confidence: number | null;
    nutrition_snapshot: unknown;
    audit_id: string | null;
    resolution_status: string | null;
    logged_at: string;
  }>> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    const d = clamp(days, 1, 365);
    return this.prisma.$queryRawUnsafe(
      `SELECT id, meal_type::text AS meal_type, meal_name,
              kcal, detected_name, cooking_method,
              ai_confidence::float AS ai_confidence,
              nutrition_snapshot, audit_id, resolution_status,
              logged_at
         FROM public.meal_logs
        WHERE client_id = $1::uuid
          AND logged_at >= now() - ($2 || ' days')::interval
        ORDER BY logged_at DESC
        LIMIT 300`,
      clientId,
      String(d),
    );
  }

  async workspaceClientHabits(workspaceId: string, clientId: string, days = 30): Promise<Array<{
    date: string;
    water_ml: number;
    sleep_hours: number | null;
    exercise_minutes: number;
    weight_kg: number | null;
    mood: number | null;
    energy: number | null;
  }>> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    const d = clamp(days, 1, 365);
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      log_date: string;
      water_intake: number | null;
      sleep_hours: string | null;
      activity_minutes: number | null;
      weight: string | null;
      mood: number | null;
      energy: number | null;
    }>>(
      `SELECT to_char(log_date, 'YYYY-MM-DD') AS log_date,
              water_intake, sleep_hours, activity_minutes, weight, mood, energy
         FROM public.daily_logs
        WHERE client_id = $1::uuid
          AND log_date > CURRENT_DATE - ($2 || ' days')::interval
        ORDER BY log_date DESC`,
      clientId,
      String(d),
    );
    return rows.map((r) => ({
      date: r.log_date,
      water_ml: Number(r.water_intake ?? 0),
      sleep_hours: r.sleep_hours != null ? Number(r.sleep_hours) : null,
      exercise_minutes: Number(r.activity_minutes ?? 0),
      weight_kg: r.weight != null ? Number(r.weight) : null,
      mood: r.mood,
      energy: r.energy,
    }));
  }

  async workspaceClientMeasurements(workspaceId: string, clientId: string): Promise<Array<{
    id: string;
    recorded_at: string;
    arm_inches: number | null;
    chest_inches: number | null;
    waist_inches: number | null;
    hip_inches: number | null;
    thigh_inches: number | null;
    notes: string | null;
  }>> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    return this.prisma.$queryRawUnsafe(
      `SELECT id, recorded_at,
              arm_inches::float    AS arm_inches,
              chest_inches::float  AS chest_inches,
              waist_inches::float  AS waist_inches,
              hip_inches::float    AS hip_inches,
              thigh_inches::float  AS thigh_inches,
              notes
         FROM public.client_measurements
        WHERE client_id = $1::uuid
        ORDER BY recorded_at DESC
        LIMIT 100`,
      clientId,
    );
  }

  /**
   * The wellness profile a client maintains on their own Settings page
   * (age, gender, height, goals, activity, allergies, medical conditions,
   * food preferences). Surfaced read-only on the nutritionist's client page
   * so it stays in sync the moment the client edits it.
   */
  async workspaceClientProfile(workspaceId: string, clientId: string): Promise<{
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    age: number | null;
    gender: string | null;
    height_cm: number | null;
    goals: string | null;
    activity_level: string | null;
    allergies: string | null;
    medical_conditions: string | null;
    food_preferences: string | null;
    service_type: string | null;
    onboarded_at: string | null;
    updated_at: string | null;
  }> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    const [row] = await this.prisma.$queryRawUnsafe<Array<{
      id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      age: number | null;
      gender: string | null;
      height_cm: number | null;
      goals: string | null;
      activity_level: string | null;
      allergies: string | null;
      medical_conditions: string | null;
      food_preferences: string | null;
      service_type: string | null;
      onboarded_at: string | null;
      updated_at: string | null;
    }>>(
      `SELECT id, name, email, phone, age, gender::text AS gender,
              height_cm, goals, activity_level, allergies,
              medical_conditions, food_preferences, service_type,
              onboarded_at, updated_at
         FROM public.clients
        WHERE id = $1::uuid AND workspace_id = $2::uuid
        LIMIT 1`,
      clientId,
      workspaceId,
    );
    return row;
  }

  async workspaceClientNutritionAudit(workspaceId: string, clientId: string, limit = 50): Promise<Array<{
    id: string;
    target_type: string;
    food_id: string | null;
    food_name: string | null;
    food_source: string | null;
    inputs: unknown;
    outputs: unknown;
    ai_confidence: number | null;
    engine_version: string;
    database_version: string;
    created_at: string;
  }>> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    const lim = clamp(limit, 1, 200);
    // Join via client_id ← inputs.client_id is not stored; we use meal_logs
    // pointing at audit_id, plus the workspace_id stamp on nutrition_audit
    // itself when it was written through Plate Vision / Voice AI.
    return this.prisma.$queryRawUnsafe(
      `SELECT na.id, na.target_type, na.food_id,
              f.canonical_name      AS food_name,
              f.source::text        AS food_source,
              na.inputs, na.outputs,
              na.ai_confidence::float AS ai_confidence,
              na.engine_version, na.database_version, na.created_at
         FROM public.nutrition_audit na
         LEFT JOIN public.foods f ON f.id = na.food_id
         LEFT JOIN public.meal_logs ml ON ml.audit_id = na.id
        WHERE (
              -- Direct: workspace stamped on the audit row
              na.workspace_id = $1::uuid
              OR
              -- Indirect: via meal_log → client → workspace
              ml.client_id = $2::uuid
        )
          AND ($2::uuid IS NULL OR ml.client_id = $2::uuid OR EXISTS (
              SELECT 1 FROM public.clients c
               WHERE c.id = $2::uuid AND c.workspace_id = $1::uuid
          ))
        ORDER BY na.created_at DESC
        LIMIT $3`,
      workspaceId,
      clientId,
      lim,
    );
  }

  async workspaceClientNutritionTrends(workspaceId: string, clientId: string, days = 14): Promise<Array<{
    date: string;
    total_kcal: number;
    total_protein_g: number;
    total_carbs_g: number;
    total_fat_g: number;
    meals_count: number;
  }>> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    const d = clamp(days, 1, 90);
    // Reads frozen snapshots — no recalculation. If snapshot is missing,
    // falls back to the legacy kcal column so historical data still totals.
    return this.prisma.$queryRawUnsafe(
      `SELECT to_char(logged_at::date, 'YYYY-MM-DD') AS date,
              COALESCE(SUM(((nutrition_snapshot->>'energy_kcal')::float)), SUM(kcal), 0)::float AS total_kcal,
              COALESCE(SUM(((nutrition_snapshot->>'protein_g')::float)),       0)::float AS total_protein_g,
              COALESCE(SUM(((nutrition_snapshot->>'carbohydrate_g')::float)),  0)::float AS total_carbs_g,
              COALESCE(SUM(((nutrition_snapshot->>'fat_g')::float)),           0)::float AS total_fat_g,
              COUNT(*)::int AS meals_count
         FROM public.meal_logs
        WHERE client_id = $1::uuid
          AND logged_at::date > CURRENT_DATE - ($2 || ' days')::interval
        GROUP BY logged_at::date
        ORDER BY date DESC`,
      clientId,
      String(d),
    );
  }

  async listWorkspaceConversations(workspaceId: string): Promise<ConversationSummary[]> {
    // One client = one conversation. Surface clients with at least one message,
    // plus the latest message body/time + unread count (unread = not-read +
    // sender_type != 'admin'). Sort by most-recent activity.
    return this.prisma.$queryRawUnsafe<ConversationSummary[]>(
      `WITH client_msgs AS (
         SELECT m.client_id,
                m.content,
                m.sender_type,
                m.is_read,
                m.created_at,
                ROW_NUMBER() OVER (PARTITION BY m.client_id ORDER BY m.created_at DESC) AS rn
           FROM public.messages m
           JOIN public.clients c ON c.id = m.client_id
          WHERE c.workspace_id = $1::uuid
            AND COALESCE(m.metadata->>'status', '') <> 'scheduled'
            AND COALESCE(m.metadata->>'hidden_admin', '') <> 'true'
       ),
       last_msg AS (
         SELECT client_id, content, sender_type, created_at
           FROM client_msgs WHERE rn = 1
       ),
       unread_counts AS (
         SELECT client_id, COUNT(*)::int AS unread
           FROM client_msgs
          WHERE is_read = false AND sender_type <> 'admin'
          GROUP BY client_id
       )
       SELECT c.id                                AS client_id,
              c.name                              AS client_name,
              COALESCE(c.program_type::text, '')  AS program,
              c.status::text                      AS status,
              c.avatar_url                        AS avatar_url,
              c.last_active_at                    AS last_active_at,
              lm.content                          AS last_message,
              lm.sender_type                      AS last_sender,
              lm.created_at                       AS last_message_at,
              COALESCE(uc.unread, 0)::int         AS unread
         FROM public.clients c
         LEFT JOIN last_msg     lm ON lm.client_id = c.id
         LEFT JOIN unread_counts uc ON uc.client_id = c.id
        WHERE c.workspace_id = $1::uuid
          AND lm.created_at IS NOT NULL
        ORDER BY lm.created_at DESC
        LIMIT 200`,
      workspaceId,
    );
  }

  async clientMessageThread(
    workspaceId: string,
    clientId: string,
    limit = 200,
  ): Promise<ThreadMessage[]> {
    // Confirm the client belongs to this workspace.
    const [c] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients
        WHERE id = $1::uuid AND workspace_id = $2::uuid
        LIMIT 1`,
      clientId,
      workspaceId,
    );
    if (!c) throw new NotFoundException('Client not in this workspace.');

    return this.prisma.$queryRawUnsafe<ThreadMessage[]>(
      `SELECT id, sender_type, message_type, content, is_read, created_at,
              metadata, attachment_url, attachment_name, attachment_type, attachment_size
         FROM public.messages
        WHERE client_id = $1::uuid
          AND COALESCE(metadata->>'status', '') <> 'scheduled'
          AND COALESCE(metadata->>'hidden_admin', '') <> 'true'
        ORDER BY created_at ASC
        LIMIT $2`,
      clientId,
      clamp(limit, 1, 500),
    );
  }

  /** Mark all client→admin messages as read once the admin opens the thread. */
  async markThreadRead(workspaceId: string, clientId: string): Promise<{ marked: number }> {
    const [c] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients
        WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
      clientId,
      workspaceId,
    );
    if (!c) throw new NotFoundException('Client not in this workspace.');

    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE public.messages
          SET is_read = true
        WHERE client_id = $1::uuid
          AND is_read = false
          AND sender_type <> 'admin'
       RETURNING id`,
      clientId,
    );
    return { marked: rows.length };
  }

  // ─────────────────────────────────────────────────────────────────
  // Wave 1 — engagement + India features
  // ─────────────────────────────────────────────────────────────────

  // -- Mood + energy ----------------------------------------------------
  async logMood(
    userId: string,
    body: { mood?: number; energy?: number; mood_notes?: string; date?: string },
  ): Promise<{ date: string; mood: number | null; energy: number | null }> {
    const me = await this.myClientId(userId);
    const date = body.date ?? new Date().toISOString().slice(0, 10);
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{ log_date: string; mood: number | null; energy: number | null }>
    >(
      `INSERT INTO public.daily_logs (client_id, log_date, mood, energy, mood_notes)
       VALUES ($1::uuid, $2::date, $3::smallint, $4::smallint, $5)
       ON CONFLICT (client_id, log_date) DO UPDATE SET
         mood       = COALESCE(EXCLUDED.mood,       public.daily_logs.mood),
         energy     = COALESCE(EXCLUDED.energy,     public.daily_logs.energy),
         mood_notes = COALESCE(EXCLUDED.mood_notes, public.daily_logs.mood_notes),
         updated_at = now()
      RETURNING to_char(log_date, 'YYYY-MM-DD') AS log_date, mood, energy`,
      me,
      date,
      body.mood ?? null,
      body.energy ?? null,
      body.mood_notes ?? null,
    );
    return { date: row.log_date, mood: row.mood, energy: row.energy };
  }

  async myMoodHistory(userId: string, days = 30): Promise<Array<{
    date: string; mood: number | null; energy: number | null; notes: string | null;
  }>> {
    const me = await this.myClientId(userId);
    const d = clamp(days, 1, 365);
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      log_date: string; mood: number | null; energy: number | null; mood_notes: string | null;
    }>>(
      `SELECT to_char(log_date, 'YYYY-MM-DD') AS log_date, mood, energy, mood_notes
         FROM public.daily_logs
        WHERE client_id = $1::uuid
          AND (mood IS NOT NULL OR energy IS NOT NULL)
          AND log_date > CURRENT_DATE - ($2 || ' days')::interval
        ORDER BY log_date DESC`,
      me,
      String(d),
    );
    return rows.map((r) => ({
      date: r.log_date, mood: r.mood, energy: r.energy, notes: r.mood_notes,
    }));
  }

  // -- Cycle tracker ----------------------------------------------------
  async myCycleEvents(userId: string, days = 180): Promise<CycleEvent[]> {
    const me = await this.myClientId(userId);
    const d = clamp(days, 1, 730);
    return this.prisma.$queryRawUnsafe<CycleEvent[]>(
      `SELECT id, event_type, to_char(event_date, 'YYYY-MM-DD') AS event_date,
              flow_level, notes
         FROM public.cycle_events
        WHERE client_id = $1::uuid
          AND event_date > CURRENT_DATE - ($2 || ' days')::interval
        ORDER BY event_date DESC
        LIMIT 500`,
      me,
      String(d),
    );
  }

  /** Cycle events for a client — nutritionist read-through (workspace-scoped). */
  async workspaceClientCycle(workspaceId: string, clientId: string, days = 180): Promise<CycleEvent[]> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    const d = clamp(days, 1, 730);
    return this.prisma.$queryRawUnsafe<CycleEvent[]>(
      `SELECT id, event_type, to_char(event_date, 'YYYY-MM-DD') AS event_date,
              flow_level, notes
         FROM public.cycle_events
        WHERE client_id = $1::uuid
          AND event_date > CURRENT_DATE - ($2 || ' days')::interval
        ORDER BY event_date DESC
        LIMIT 500`,
      clientId,
      String(d),
    );
  }

  async logCycleEvent(
    userId: string,
    body: { event_type: CycleEvent['event_type']; event_date?: string; flow_level?: number; notes?: string },
  ): Promise<CycleEvent> {
    const me = await this.myClientId(userId);
    const eventDate = body.event_date ?? new Date().toISOString().slice(0, 10);
    const [row] = await this.prisma.$queryRawUnsafe<CycleEvent[]>(
      `INSERT INTO public.cycle_events (client_id, event_type, event_date, flow_level, notes)
       VALUES ($1::uuid, $2, $3::date, $4::smallint, $5)
       RETURNING id, event_type, to_char(event_date, 'YYYY-MM-DD') AS event_date,
                 flow_level, notes`,
      me,
      body.event_type,
      eventDate,
      body.flow_level ?? null,
      body.notes ?? null,
    );
    return row;
  }

  async deleteCycleEvent(userId: string, id: string): Promise<{ deleted: true }> {
    const me = await this.myClientId(userId);
    const r = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `DELETE FROM public.cycle_events WHERE id = $1::uuid AND client_id = $2::uuid RETURNING id`,
      id, me,
    );
    if (!r.length) throw new NotFoundException('Event not found.');
    return { deleted: true };
  }

  /**
   * Predict next period start from the last 3-6 period_start events.
   * Returns null when there isn't enough history (<2 cycles).
   */
  async cyclePrediction(userId: string): Promise<{
    cycle_length_days: number | null;
    last_period_start: string | null;
    predicted_next_period: string | null;
    fertile_window_start: string | null;
    fertile_window_end: string | null;
  }> {
    const me = await this.myClientId(userId);
    const rows = await this.prisma.$queryRawUnsafe<Array<{ event_date: string }>>(
      `SELECT to_char(event_date, 'YYYY-MM-DD') AS event_date
         FROM public.cycle_events
        WHERE client_id = $1::uuid AND event_type = 'period_start'
        ORDER BY event_date DESC
        LIMIT 6`,
      me,
    );
    if (rows.length < 1) {
      return { cycle_length_days: null, last_period_start: null,
        predicted_next_period: null, fertile_window_start: null, fertile_window_end: null };
    }
    const dates = rows.map((r) => new Date(r.event_date).getTime()).sort((a, b) => b - a);
    if (dates.length < 2) {
      return {
        cycle_length_days: null,
        last_period_start: rows[0].event_date,
        predicted_next_period: null,
        fertile_window_start: null, fertile_window_end: null,
      };
    }
    // Average gap (most recent first → newer gaps weighted more)
    const gaps: number[] = [];
    for (let i = 0; i < dates.length - 1; i++) {
      gaps.push(Math.round((dates[i] - dates[i + 1]) / 86_400_000));
    }
    const avg = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    const last = new Date(dates[0]);
    const next = new Date(last.getTime() + avg * 86_400_000);
    // Fertile window ≈ 14 days before next period, ±2 days.
    const fertileEnd   = new Date(next.getTime() - 12 * 86_400_000);
    const fertileStart = new Date(next.getTime() - 16 * 86_400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return {
      cycle_length_days: avg,
      last_period_start: fmt(last),
      predicted_next_period: fmt(next),
      fertile_window_start: fmt(fertileStart),
      fertile_window_end:   fmt(fertileEnd),
    };
  }

  // -- Photo journal ---------------------------------------------------
  async myProgressPhotos(userId: string): Promise<ProgressPhoto[]> {
    const me = await this.myClientId(userId);
    return this.prisma.$queryRawUnsafe<ProgressPhoto[]>(
      `SELECT id, taken_at, angle, storage_key,
              weight_kg::float AS weight_kg, notes
         FROM public.progress_photos
        WHERE client_id = $1::uuid
        ORDER BY taken_at DESC
        LIMIT 200`,
      me,
    );
  }

  async addProgressPhoto(
    userId: string,
    body: { storage_key: string; angle?: 'front' | 'side' | 'back'; weight_kg?: number; notes?: string; taken_at?: string },
  ): Promise<ProgressPhoto> {
    const me = await this.myClientId(userId);
    const takenAt = body.taken_at ? new Date(body.taken_at) : new Date();
    if (Number.isNaN(takenAt.getTime())) {
      throw new BadRequestException('taken_at must be a valid ISO timestamp.');
    }
    const [row] = await this.prisma.$queryRawUnsafe<ProgressPhoto[]>(
      `INSERT INTO public.progress_photos (client_id, taken_at, angle, storage_key, weight_kg, notes)
       VALUES ($1::uuid, $2::timestamptz, $3, $4, $5::numeric, $6)
       RETURNING id, taken_at, angle, storage_key, weight_kg::float AS weight_kg, notes`,
      me,
      takenAt.toISOString(),
      body.angle ?? null,
      body.storage_key,
      body.weight_kg ?? null,
      body.notes ?? null,
    );
    return row;
  }

  async deleteProgressPhoto(userId: string, id: string): Promise<{ deleted: true }> {
    const me = await this.myClientId(userId);
    const r = await this.prisma.$queryRawUnsafe<Array<{ id: string; storage_key: string }>>(
      `DELETE FROM public.progress_photos
        WHERE id = $1::uuid AND client_id = $2::uuid
       RETURNING id, storage_key`,
      id, me,
    );
    if (!r.length) throw new NotFoundException('Photo not found.');
    // Best-effort storage delete — we don't fail the API if Supabase storage is slow.
    void this.deleteFromStorage('progress-photos', r[0].storage_key)
      .catch((err) => this.logger.warn(`Could not remove storage object ${r[0].storage_key}: ${err}`));
    return { deleted: true };
  }

  /** Sign a short-lived URL so the browser can render a stored photo. */
  async signProgressPhoto(userId: string, id: string): Promise<{ url: string; expiresInSeconds: number }> {
    const me = await this.myClientId(userId);
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ storage_key: string }>>(
      `SELECT storage_key FROM public.progress_photos
        WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1`,
      id, me,
    );
    if (!row) throw new NotFoundException('Photo not found.');
    return this.signStorageObject('progress-photos', row.storage_key);
  }

  /**
   * Issue a one-shot upload token + path the client can POST a photo to.
   * The browser POSTs the file directly to Supabase storage so the backend
   * doesn't have to proxy bytes. After upload, the browser calls
   * addProgressPhoto with the returned storage_key to create the DB row.
   */
  async createPhotoUploadTicket(
    userId: string,
    fileName: string,
  ): Promise<{ uploadUrl: string; storageKey: string; token: string }> {
    const me = await this.myClientId(userId);
    const supabaseUrl = this.config.getOrThrow<string>('SUPABASE_URL').trim();
    const serviceKey  = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY').trim();
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
    // Folder per client so signed downloads can't traverse.
    const key = `${me}/${Date.now()}-${randomBytes(6).toString('hex')}-${safe}`;

    // Use Supabase's signed-upload-url feature so the browser can PUT directly.
    const resp = await fetch(
      `${supabaseUrl}/storage/v1/object/upload/sign/progress-photos/${key}`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}` },
      },
    );
    if (!resp.ok) {
      const text = await resp.text();
      this.logger.warn(`Sign upload failed: ${resp.status} ${text}`);
      throw new BadRequestException('Could not prepare upload.');
    }
    const json = (await resp.json()) as { url?: string; token?: string };
    if (!json.url || !json.token) {
      throw new BadRequestException('Storage did not return a signed upload URL.');
    }
    const fullUrl = json.url.startsWith('http')
      ? json.url
      : `${supabaseUrl}/storage/v1${json.url.startsWith('/') ? '' : '/'}${json.url}`;
    return { uploadUrl: fullUrl, storageKey: key, token: json.token };
  }

  // -- Symptom tracker -------------------------------------------------
  async mySymptoms(userId: string, days = 60): Promise<Symptom[]> {
    const me = await this.myClientId(userId);
    const d = clamp(days, 1, 365);
    return this.prisma.$queryRawUnsafe<Symptom[]>(
      `SELECT id, occurred_at, symptom, severity, notes, suspected_trigger
         FROM public.symptom_logs
        WHERE client_id = $1::uuid
          AND occurred_at > now() - ($2 || ' days')::interval
        ORDER BY occurred_at DESC
        LIMIT 300`,
      me,
      String(d),
    );
  }

  async logSymptom(
    userId: string,
    body: { symptom: string; severity?: number; notes?: string; suspected_trigger?: string; occurred_at?: string },
  ): Promise<Symptom> {
    const me = await this.myClientId(userId);
    const name = body.symptom.trim();
    if (!name) throw new BadRequestException('Symptom name is required.');
    if (name.length > 80) throw new BadRequestException('Symptom name too long.');
    const occurredAt = body.occurred_at ? new Date(body.occurred_at) : new Date();
    const [row] = await this.prisma.$queryRawUnsafe<Symptom[]>(
      `INSERT INTO public.symptom_logs
         (client_id, occurred_at, symptom, severity, notes, suspected_trigger)
       VALUES ($1::uuid, $2::timestamptz, $3, $4::smallint, $5, $6)
       RETURNING id, occurred_at, symptom, severity, notes, suspected_trigger`,
      me,
      occurredAt.toISOString(),
      name,
      body.severity ?? 2,
      body.notes ?? null,
      body.suspected_trigger ?? null,
    );
    return row;
  }

  async deleteSymptom(userId: string, id: string): Promise<{ deleted: true }> {
    const me = await this.myClientId(userId);
    const r = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `DELETE FROM public.symptom_logs
        WHERE id = $1::uuid AND client_id = $2::uuid RETURNING id`,
      id, me,
    );
    if (!r.length) throw new NotFoundException('Symptom not found.');
    return { deleted: true };
  }

  // -- Goal milestones -------------------------------------------------
  async myMilestones(userId: string): Promise<Milestone[]> {
    const me = await this.myClientId(userId);
    // Compute fresh milestones each time we list — cheap and keeps the table
    // in sync without scheduled jobs.
    await this.recomputeMilestones(me);
    return this.prisma.$queryRawUnsafe<Milestone[]>(
      `SELECT id, kind, value::float AS value, achieved_at, celebrated, message
         FROM public.client_milestones
        WHERE client_id = $1::uuid
        ORDER BY achieved_at DESC
        LIMIT 50`,
      me,
    );
  }

  async celebrateMilestone(userId: string, id: string): Promise<{ celebrated: true }> {
    const me = await this.myClientId(userId);
    const r = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE public.client_milestones
          SET celebrated = true
        WHERE id = $1::uuid AND client_id = $2::uuid RETURNING id`,
      id, me,
    );
    if (!r.length) throw new NotFoundException('Milestone not found.');
    return { celebrated: true };
  }

  /**
   * Look at habit + measurement history and INSERT a milestones row for
   * each threshold the client has just crossed. UNIQUE constraint dedupes.
   */
  private async recomputeMilestones(clientId: string): Promise<void> {
    // Weight lost (kg) — compare earliest weight to lowest weight ever.
    const [w] = await this.prisma.$queryRawUnsafe<Array<{ first_w: number | null; min_w: number | null }>>(
      // Postgres FILTER must wrap the aggregate before any cast — wrap in parens.
      `SELECT (MIN(weight) FILTER (WHERE log_date = (SELECT MIN(log_date) FROM public.daily_logs WHERE client_id = $1::uuid AND weight IS NOT NULL)))::float AS first_w,
              MIN(weight)::float AS min_w
         FROM public.daily_logs
        WHERE client_id = $1::uuid AND weight IS NOT NULL`,
      clientId,
    );
    if (w?.first_w != null && w.min_w != null && w.first_w > w.min_w) {
      const lost = w.first_w - w.min_w;
      const thresholds = [1, 2, 5, 10, 15, 20];
      for (const t of thresholds) {
        if (lost >= t) {
          await this.prisma.$queryRawUnsafe(
            `INSERT INTO public.client_milestones (client_id, kind, value, message)
             VALUES ($1::uuid, 'weight_lost_kg', $2::numeric, $3)
             ON CONFLICT (client_id, kind, value) DO NOTHING`,
            clientId, t, `You lost ${t} kg. That's huge.`,
          );
        }
      }
    }

    // Streak days — count consecutive logged days back from today.
    const [s] = await this.prisma.$queryRawUnsafe<Array<{ streak: number }>>(
      `SELECT COALESCE(MAX(streak_len), 0)::int AS streak FROM (
         SELECT COUNT(*) AS streak_len FROM (
           SELECT log_date,
                  log_date - (ROW_NUMBER() OVER (ORDER BY log_date DESC))::int * INTERVAL '1 day' AS grp
             FROM public.daily_logs
            WHERE client_id = $1::uuid
              AND (water_intake > 0 OR activity_minutes > 0 OR weight IS NOT NULL OR sleep_hours IS NOT NULL OR mood IS NOT NULL)
              AND log_date <= CURRENT_DATE
            ORDER BY log_date DESC LIMIT 200
         ) d GROUP BY grp ORDER BY MAX(log_date) DESC LIMIT 1
       ) sub`,
      clientId,
    );
    const streakThresholds = [3, 7, 14, 30, 60, 100];
    for (const t of streakThresholds) {
      if ((s?.streak ?? 0) >= t) {
        await this.prisma.$queryRawUnsafe(
          `INSERT INTO public.client_milestones (client_id, kind, value, message)
           VALUES ($1::uuid, 'streak_days', $2::numeric, $3)
           ON CONFLICT (client_id, kind, value) DO NOTHING`,
          clientId, t, `${t}-day streak. Consistency wins.`,
        );
      }
    }

    // Waist inches lost
    const [m] = await this.prisma.$queryRawUnsafe<Array<{ first: number | null; min: number | null }>>(
      `SELECT (SELECT waist_inches FROM public.client_measurements
                WHERE client_id = $1::uuid AND waist_inches IS NOT NULL
                ORDER BY recorded_at ASC LIMIT 1)::float AS first,
              MIN(waist_inches)::float AS min
         FROM public.client_measurements
        WHERE client_id = $1::uuid AND waist_inches IS NOT NULL`,
      clientId,
    );
    if (m?.first != null && m.min != null && m.first > m.min) {
      const lostIn = m.first - m.min;
      for (const t of [1, 2, 4, 6]) {
        if (lostIn >= t) {
          await this.prisma.$queryRawUnsafe(
            `INSERT INTO public.client_milestones (client_id, kind, value, message)
             VALUES ($1::uuid, 'waist_lost_in', $2::numeric, $3)
             ON CONFLICT (client_id, kind, value) DO NOTHING`,
            clientId, t, `${t} inches off your waist. Visible wins.`,
          );
        }
      }
    }
  }

  // -- Supplements -----------------------------------------------------
  async mySupplements(userId: string): Promise<Supplement[]> {
    const me = await this.myClientId(userId);
    return this.prisma.$queryRawUnsafe<Supplement[]>(
      `SELECT id, name, dosage, schedule, active, notes, created_at
         FROM public.client_supplements
        WHERE client_id = $1::uuid AND active = true
        ORDER BY name`,
      me,
    );
  }

  async upsertSupplement(
    userId: string,
    body: { id?: string; name: string; dosage?: string; schedule?: string[]; notes?: string },
  ): Promise<Supplement> {
    const me = await this.myClientId(userId);
    if (!body.name?.trim()) throw new BadRequestException('Name required.');
    if (body.id) {
      const [r] = await this.prisma.$queryRawUnsafe<Supplement[]>(
        `UPDATE public.client_supplements
            SET name = $3, dosage = $4, schedule = $5::text[], notes = $6, updated_at = now()
          WHERE id = $1::uuid AND client_id = $2::uuid
         RETURNING id, name, dosage, schedule, active, notes, created_at`,
        body.id, me, body.name.trim(), body.dosage ?? null,
        body.schedule ?? [], body.notes ?? null,
      );
      if (!r) throw new NotFoundException('Supplement not found.');
      return r;
    }
    const [r] = await this.prisma.$queryRawUnsafe<Supplement[]>(
      `INSERT INTO public.client_supplements (client_id, name, dosage, schedule, notes)
       VALUES ($1::uuid, $2, $3, $4::text[], $5)
       RETURNING id, name, dosage, schedule, active, notes, created_at`,
      me, body.name.trim(), body.dosage ?? null, body.schedule ?? [], body.notes ?? null,
    );
    return r;
  }

  async deactivateSupplement(userId: string, id: string): Promise<{ deactivated: true }> {
    const me = await this.myClientId(userId);
    const r = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE public.client_supplements
          SET active = false, updated_at = now()
        WHERE id = $1::uuid AND client_id = $2::uuid RETURNING id`,
      id, me,
    );
    if (!r.length) throw new NotFoundException('Supplement not found.');
    return { deactivated: true };
  }

  async logSupplementTaken(
    userId: string,
    id: string,
    slot?: string,
  ): Promise<{ taken: true }> {
    const me = await this.myClientId(userId);
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.supplement_logs (supplement_id, client_id, slot)
       SELECT id, client_id, $3 FROM public.client_supplements
        WHERE id = $1::uuid AND client_id = $2::uuid`,
      id, me, slot ?? null,
    );
    return { taken: true };
  }

  async todaysSupplementLog(userId: string): Promise<Array<{ supplement_id: string; slot: string | null; taken_at: string }>> {
    const me = await this.myClientId(userId);
    return this.prisma.$queryRawUnsafe<Array<{ supplement_id: string; slot: string | null; taken_at: string }>>(
      `SELECT supplement_id, slot, taken_at
         FROM public.supplement_logs
        WHERE client_id = $1::uuid
          AND taken_at >= CURRENT_DATE
        ORDER BY taken_at`,
      me,
    );
  }

  // -- Festivals (static — no DB) --------------------------------------

  /**
   * Calendar of major Indian festivals for the next 12 months. Static because
   * the dates are deterministic for Gregorian-fixed ones and pre-computed for
   * lunar ones — this avoids a third-party API dependency in dev. Replace
   * with a proper lookup when you need >1 year ahead.
   */
  upcomingFestivals(): Festival[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Year-agnostic month/day. We project into the current + next year and filter to "next 90 days".
    const STATIC: Array<Omit<Festival, 'date'> & { mm: number; dd: number }> = [
      { name: 'Pongal',          tone: 'Sweets + festive meals - pace yourself.',          icon: 'sunrise',  mm: 1, dd: 14 },
      { name: 'Republic Day',    tone: 'A national holiday.',                              icon: 'flag',     mm: 1, dd: 26 },
      { name: 'Holi',            tone: 'Thandai + sweets day. Hydrate + step it up tomorrow.', icon: 'sparkles', mm: 3, dd: 14 },
      { name: 'Ugadi',           tone: 'Sweet + sour blend - eat slowly, enjoy fully.',    icon: 'sun',      mm: 3, dd: 30 },
      { name: 'Eid al-Fitr',     tone: 'Sweets, biryani, family. Add a brisk walk after.', icon: 'moon',     mm: 4, dd: 10 },
      { name: 'Tamil New Year',  tone: 'Festive plates - protein early, sweet late.',      icon: 'sparkles', mm: 4, dd: 14 },
      { name: 'Independence Day',tone: 'Public holiday.',                                  icon: 'flag',     mm: 8, dd: 15 },
      { name: 'Raksha Bandhan',  tone: 'Sweets shared with family. Save half for tomorrow.', icon: 'sparkles', mm: 8, dd: 19 },
      { name: 'Janmashtami',     tone: 'Fasting day for many - gentle re-fuel after.',     icon: 'moon',     mm: 8, dd: 26 },
      { name: 'Ganesh Chaturthi',tone: 'Modak season. One a day, not three.',              icon: 'sparkles', mm: 9, dd: 7  },
      { name: 'Onam',            tone: 'Sadya feast - eat slow, eat half.',                icon: 'sun',      mm: 9, dd: 5  },
      { name: 'Navratri',        tone: 'Fasting + dancing. Hydrate, log mood daily.',      icon: 'sparkles', mm: 10, dd: 3 },
      { name: 'Dussehra',        tone: 'Big meal day - split into two smaller ones.',      icon: 'flag',     mm: 10, dd: 12 },
      { name: 'Karwa Chauth',    tone: 'Sunrise-to-moonrise fast. Hydrate well at sundown.', icon: 'moon',   mm: 11, dd: 1 },
      { name: 'Diwali',          tone: 'Sweets week. Pace, walk, water.',                  icon: 'sparkles', mm: 11, dd: 1 },
      { name: 'Bhai Dooj',       tone: 'Family meals - focus on connection, not seconds.', icon: 'sparkles', mm: 11, dd: 3 },
      { name: 'Christmas',       tone: 'Festive treats. Add 20 min walk after dinner.',    icon: 'sparkles', mm: 12, dd: 25 },
    ];
    const out: Festival[] = [];
    for (const item of STATIC) {
      for (const yearOffset of [0, 1]) {
        const candidate = new Date(today.getFullYear() + yearOffset, item.mm - 1, item.dd);
        const diff = (candidate.getTime() - today.getTime()) / 86_400_000;
        if (diff >= 0 && diff <= 90) {
          out.push({ name: item.name, tone: item.tone, icon: item.icon,
            date: candidate.toISOString().slice(0, 10) });
        }
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  }

  // -- AI weekly summary -----------------------------------------------
  async myWeeklySummary(userId: string): Promise<{ summary: string; metrics: Record<string, unknown> }> {
    const me = await this.myClientId(userId);

    // Gather last 7 days of signal.
    const [stats] = await this.prisma.$queryRawUnsafe<Array<{
      logged_days: number;
      avg_water: number | null;
      total_exercise: number | null;
      avg_sleep: number | null;
      avg_mood: number | null;
      avg_energy: number | null;
      meals_logged: number;
    }>>(
      `WITH window7 AS (
         SELECT * FROM public.daily_logs
          WHERE client_id = $1::uuid AND log_date >= CURRENT_DATE - INTERVAL '7 days'
       )
       SELECT COUNT(*)::int                                                 AS logged_days,
              AVG(water_intake)                                              AS avg_water,
              SUM(activity_minutes)                                          AS total_exercise,
              AVG(sleep_hours)                                               AS avg_sleep,
              AVG(mood)                                                      AS avg_mood,
              AVG(energy)                                                    AS avg_energy,
              (SELECT COUNT(*)::int FROM public.meal_logs ml
                JOIN public.clients c ON c.id = ml.client_id
                WHERE c.user_id = $2::uuid
                  AND ml.logged_at >= CURRENT_DATE - INTERVAL '7 days')      AS meals_logged
         FROM window7`,
      me,
      userId,
    );

    const metrics = {
      logged_days:    Number(stats?.logged_days ?? 0),
      avg_water_ml:   stats?.avg_water  != null ? Math.round(Number(stats.avg_water)) : null,
      total_exercise_min: stats?.total_exercise != null ? Number(stats.total_exercise) : 0,
      avg_sleep_hrs:  stats?.avg_sleep  != null ? +Number(stats.avg_sleep).toFixed(1) : null,
      avg_mood:       stats?.avg_mood   != null ? +Number(stats.avg_mood).toFixed(1)  : null,
      avg_energy:     stats?.avg_energy != null ? +Number(stats.avg_energy).toFixed(1) : null,
      meals_logged:   Number(stats?.meals_logged ?? 0),
    };

    // Try Gemini if configured AND the workspace is within its monthly AI
    // quota; otherwise return the deterministic template summary.
    const geminiKey = this.config.get<string>('GEMINI_API_KEY');
    const overQuota = (await this.usage.checkQuota()).exceeded;
    if (geminiKey && !overQuota) {
      try {
        const summary = await this.geminiWeeklySummary(geminiKey, metrics);
        return { summary, metrics };
      } catch (err) {
        this.logger.warn(`Gemini summary failed, falling back to template: ${(err as Error).message}`);
      }
    }
    return { summary: this.fallbackWeeklySummary(metrics), metrics };
  }

  private fallbackWeeklySummary(m: Record<string, unknown>): string {
    const parts: string[] = [];
    if ((m.logged_days as number) >= 6)      parts.push('You logged almost every day this week - that consistency is the win.');
    else if ((m.logged_days as number) >= 3) parts.push(`You logged ${m.logged_days} of 7 days. Try one more tomorrow.`);
    else                                      parts.push('Light logging week. One sip of water tracked is a win - start small.');
    if ((m.avg_water_ml as number) >= 2000)  parts.push(`Average ${m.avg_water_ml} ml of water - strong hydration.`);
    if ((m.total_exercise_min as number) >= 100) parts.push(`${m.total_exercise_min} minutes of exercise this week.`);
    if ((m.avg_sleep_hrs as number) && (m.avg_sleep_hrs as number) >= 7) parts.push('Sleep is in a healthy range.');
    if ((m.avg_mood as number) && (m.avg_mood as number) >= 3.5) parts.push('Mood trending positive.');
    if (parts.length === 0) parts.push('Quiet week. Worth a check-in with yourself - what felt off?');
    return parts.join(' ');
  }

  private async geminiWeeklySummary(apiKey: string, m: Record<string, unknown>): Promise<string> {
    const prompt = `You are a warm wellness coach writing a 2-3 sentence weekly summary for a client. Be specific, encouraging, never preachy. Use the numbers below. Keep it under 80 words. Numbers: ${JSON.stringify(m)}`;
    const t0 = Date.now();
    let resp: Response;
    try {
      resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            // gemini-2.5-flash is a "thinking" model: its reasoning tokens count
            // against maxOutputTokens. thinkingBudget: 0 disables thinking so the
            // whole budget goes to the visible answer (a small budget was being
            // consumed by thinking, truncating the summary mid-sentence).
            generationConfig: {
              maxOutputTokens: 512,
              temperature: 0.7,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        },
      );
    } catch (err) {
      void this.usage.record({
        service: 'chat', provider: 'gemini', model: 'gemini-2.5-flash',
        latencyMs: Date.now() - t0, status: 'error',
        errorCode: (err as Error).message?.slice(0, 100),
        metadata: { feature: 'weekly_summary' },
      });
      throw err;
    }
    if (!resp.ok) {
      void this.usage.record({
        service: 'chat', provider: 'gemini', model: 'gemini-2.5-flash',
        latencyMs: Date.now() - t0, status: 'error', errorCode: `http_${resp.status}`,
        metadata: { feature: 'weekly_summary' },
      });
      throw new Error(`Gemini ${resp.status}`);
    }
    const json = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    };
    const u = json.usageMetadata;
    void this.usage.record({
      service: 'chat', provider: 'gemini', model: 'gemini-2.5-flash',
      inputTokens: u?.promptTokenCount ?? null,
      outputTokens: u?.candidatesTokenCount ?? null,
      totalTokens: u?.totalTokenCount ?? null,
      latencyMs: Date.now() - t0, status: 'success',
      metadata: { feature: 'weekly_summary' },
    });
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('Empty Gemini response');
    return text;
  }

  // -- Storage helpers --------------------------------------------------

  private async signStorageObject(bucket: string, key: string): Promise<{ url: string; expiresInSeconds: number }> {
    const expiresInSeconds = 60 * 60;
    const supabaseUrl = this.config.getOrThrow<string>('SUPABASE_URL').trim();
    const serviceKey  = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY').trim();
    const resp = await fetch(
      `${supabaseUrl}/storage/v1/object/sign/${bucket}/${key}`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      },
    );
    if (!resp.ok) throw new BadRequestException('Could not sign storage URL.');
    const json = (await resp.json()) as { signedURL?: string; signedUrl?: string };
    const path = json.signedURL ?? json.signedUrl;
    if (!path) throw new BadRequestException('Storage returned no URL.');
    return {
      url: `${supabaseUrl}/storage/v1${path.startsWith('/') ? '' : '/'}${path}`,
      expiresInSeconds,
    };
  }

  private async deleteFromStorage(bucket: string, key: string): Promise<void> {
    const supabaseUrl = this.config.getOrThrow<string>('SUPABASE_URL').trim();
    const serviceKey  = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY').trim();
    await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${key}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${serviceKey}` },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Push subscriptions — save/remove
  // ─────────────────────────────────────────────────────────────────

  async savePushSubscription(
    userId: string,
    body: { endpoint: string; p256dh: string; auth: string; user_agent?: string },
  ): Promise<{ subscribed: true }> {
    const [me] = await this.prisma.$queryRawUnsafe<Array<{ id: string; workspace_id: string | null }>>(
      `SELECT id, workspace_id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!me) throw new NotFoundException('No client profile linked to this user');

    // Delegate to PushService so client + staff subscriptions share one upsert
    // (keyed on endpoint, always tagged with user_id).
    return this.push.saveSubscription({
      userId,
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
      userAgent: body.user_agent ?? null,
      clientId: me.id,
      workspaceId: me.workspace_id,
    });
  }

  async removePushSubscription(
    userId: string,
    endpoint: string,
  ): Promise<{ unsubscribed: true }> {
    const [me] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!me) throw new NotFoundException('No client profile linked to this user');
    return this.push.removeSubscription({ userId, clientId: me.id }, endpoint);
  }

  // ─────────────────────────────────────────────────────────────────
  // Community — groups, posts, reactions, comments
  //
  // The legacy Sheizen platform shipped 10 community_* tables with full
  // RLS. We use them as-is rather than introducing parallel structures.
  // ─────────────────────────────────────────────────────────────────

  private async myClientId(userId: string): Promise<string> {
    const [me] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!me) throw new NotFoundException('No client profile linked to this user');
    return me.id;
  }

  async listGroups(userId: string): Promise<CommunityGroup[]> {
    const me = await this.myClientId(userId);
    const ws = await this.myWorkspaceId(userId);
    return this.prisma.$queryRawUnsafe<CommunityGroup[]>(
      `SELECT g.id, g.name, g.slug, g.description, g.cover_image_url,
              g.is_private, g.member_count,
              EXISTS (
                SELECT 1 FROM public.community_group_members gm
                 WHERE gm.group_id = g.id AND gm.client_id = $1::uuid AND gm.status = 'active'
              ) AS is_member,
              CASE
                WHEN g.owner_client_id = $1::uuid THEN 'owner'
                ELSE (
                  SELECT gm.role::text FROM public.community_group_members gm
                   WHERE gm.group_id = g.id AND gm.client_id = $1::uuid AND gm.status = 'active'
                   LIMIT 1
                )
              END AS my_role,
              (
                SELECT gm.status FROM public.community_group_members gm
                 WHERE gm.group_id = g.id AND gm.client_id = $1::uuid LIMIT 1
              ) AS my_status,
              g.created_at,
              g.is_challenge,
              g.starts_at,
              g.ends_at,
              g.target_metric::text AS target_metric,
              g.target_value
         FROM public.community_groups g
        WHERE g.workspace_id = $2::uuid
          AND (g.is_private = false OR EXISTS (
                SELECT 1 FROM public.community_group_members gm
                 WHERE gm.group_id = g.id AND gm.client_id = $1::uuid AND gm.status = 'active'
              ))
        ORDER BY (
          EXISTS (
            SELECT 1 FROM public.community_group_members gm
             WHERE gm.group_id = g.id AND gm.client_id = $1::uuid AND gm.status = 'active'
          )
        ) DESC, g.member_count DESC NULLS LAST, g.created_at DESC
        LIMIT 50`,
      me,
      ws,
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Challenge leaderboard — sums each member's target_metric inside
  // [starts_at, ends_at] and ranks. Group must have is_challenge = true.
  // ─────────────────────────────────────────────────────────────────

  async groupLeaderboard(
    userId: string,
    groupId: string,
  ): Promise<{
    group: {
      id: string; name: string; target_metric: ChallengeMetric;
      target_value: number; starts_at: string; ends_at: string;
      is_active: boolean;
    };
    entries: LeaderboardEntry[];
    me_rank: number | null;
    me_value: number;
  }> {
    const me = await this.myClientId(userId);

    const [g] = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string; name: string;
        is_challenge: boolean;
        starts_at: string | null; ends_at: string | null;
        target_metric: ChallengeMetric | null; target_value: number | null;
      }>
    >(
      `SELECT id, name, is_challenge, starts_at, ends_at,
              target_metric::text AS target_metric, target_value
         FROM public.community_groups
        WHERE id = $1::uuid
        LIMIT 1`,
      groupId,
    );
    if (!g) throw new NotFoundException('Group not found.');
    if (!g.is_challenge || !g.target_metric || !g.starts_at || !g.ends_at) {
      throw new BadRequestException('This group is not a challenge.');
    }

    // Verify the caller can see this leaderboard (member of the group OR
    // the group is public). Matches listGroups visibility.
    const [vis] = await this.prisma.$queryRawUnsafe<
      Array<{ visible: boolean }>
    >(
      `SELECT (g.is_private = false OR EXISTS (
                 SELECT 1 FROM public.community_group_members gm
                  WHERE gm.group_id = g.id AND gm.client_id = $2::uuid AND gm.status = 'active'
              )) AS visible
         FROM public.community_groups g
        WHERE g.id = $1::uuid`,
      groupId,
      me,
    );
    if (!vis?.visible) {
      throw new ForbiddenException('You can\'t see this leaderboard.');
    }

    // Build the metric expression for the join. We always join through
    // active members of THIS group so non-joiners don't pollute the board.
    // The four metrics each have their own subquery pattern.
    const sql = (() => {
      const base = `
        WITH members AS (
          SELECT gm.client_id, c.name
            FROM public.community_group_members gm
            JOIN public.clients c ON c.id = gm.client_id
           WHERE gm.group_id = $1::uuid AND gm.status = 'active'
        )`;
      switch (g.target_metric) {
        case 'water_ml':
          return `${base}
            SELECT m.client_id, m.name,
                   COALESCE(SUM(dl.water_intake), 0)::int AS value
              FROM members m
              LEFT JOIN public.daily_logs dl
                     ON dl.client_id = m.client_id
                    AND dl.log_date BETWEEN $2::date AND $3::date
             GROUP BY m.client_id, m.name`;
        case 'exercise_minutes':
          return `${base}
            SELECT m.client_id, m.name,
                   COALESCE(SUM(dl.activity_minutes), 0)::int AS value
              FROM members m
              LEFT JOIN public.daily_logs dl
                     ON dl.client_id = m.client_id
                    AND dl.log_date BETWEEN $2::date AND $3::date
             GROUP BY m.client_id, m.name`;
        case 'posts':
          return `${base}
            SELECT m.client_id, m.name,
                   COALESCE(COUNT(p.id), 0)::int AS value
              FROM members m
              LEFT JOIN public.community_posts p
                     ON p.author_client_id = m.client_id
                    AND p.group_id = $1::uuid
                    AND p.created_at BETWEEN $2::timestamptz AND $3::timestamptz
             GROUP BY m.client_id, m.name`;
        case 'streak_days':
          // Distinct logged days falling in the window. Not strictly a
          // "consecutive" streak — for a contest window we treat any
          // logged day in [start, end] as one tick toward the target.
          return `${base}
            SELECT m.client_id, m.name,
                   COALESCE(COUNT(DISTINCT dl.log_date), 0)::int AS value
              FROM members m
              LEFT JOIN public.daily_logs dl
                     ON dl.client_id = m.client_id
                    AND dl.log_date BETWEEN $2::date AND $3::date
                    AND (dl.water_intake > 0 OR dl.activity_minutes > 0
                         OR dl.weight IS NOT NULL OR dl.sleep_hours IS NOT NULL)
             GROUP BY m.client_id, m.name`;
        default:
          throw new BadRequestException(`Unsupported metric ${g.target_metric}`);
      }
    })();

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ client_id: string; name: string; value: number }>
    >(sql, groupId, g.starts_at, g.ends_at);

    // Sort + rank in JS. With group sizes in the dozens-to-hundreds this is
    // cheaper than a Postgres window function on every request.
    const sorted = rows.sort((a, b) => Number(b.value) - Number(a.value));
    const entries: LeaderboardEntry[] = sorted.map((r, i) => ({
      client_id: r.client_id,
      name: r.name,
      value: Number(r.value),
      rank: i + 1,
      is_me: r.client_id === me,
    }));

    const meEntry = entries.find((e) => e.is_me);
    const isActive = (() => {
      const now = Date.now();
      const s = g.starts_at ? new Date(g.starts_at).getTime() : 0;
      const e = g.ends_at   ? new Date(g.ends_at).getTime()   : 0;
      return now >= s && now <= e;
    })();

    return {
      group: {
        id: g.id, name: g.name,
        target_metric: g.target_metric,
        target_value:  g.target_value ?? 0,
        starts_at:     g.starts_at!,
        ends_at:       g.ends_at!,
        is_active:     isActive,
      },
      entries,
      me_rank:  meEntry?.rank  ?? null,
      me_value: meEntry?.value ?? 0,
    };
  }

  async joinGroup(userId: string, groupId: string): Promise<{ joined: true; memberCount: number }> {
    const me = await this.myClientId(userId);
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.community_group_members (group_id, client_id, role, status)
       VALUES ($1::uuid, $2::uuid, 'member', 'active')
       ON CONFLICT (group_id, client_id) DO UPDATE SET status = 'active'`,
      groupId,
      me,
    );
    // Keep member_count fresh — cheap denormalization, recomputed from truth.
    const [count] = await this.prisma.$queryRawUnsafe<Array<{ member_count: number }>>(
      `WITH new_count AS (
         SELECT COUNT(*)::int AS n FROM public.community_group_members
          WHERE group_id = $1::uuid AND status = 'active'
       )
       UPDATE public.community_groups
          SET member_count = (SELECT n FROM new_count)
        WHERE id = $1::uuid
       RETURNING member_count`,
      groupId,
    );
    if (!count) throw new NotFoundException('Group not found.');
    return { joined: true, memberCount: count.member_count };
  }

  async leaveGroup(userId: string, groupId: string): Promise<{ left: true; memberCount: number }> {
    const me = await this.myClientId(userId);
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.community_group_members
        WHERE group_id = $1::uuid AND client_id = $2::uuid`,
      groupId,
      me,
    );
    const [count] = await this.prisma.$queryRawUnsafe<Array<{ member_count: number }>>(
      `WITH new_count AS (
         SELECT COUNT(*)::int AS n FROM public.community_group_members
          WHERE group_id = $1::uuid AND status = 'active'
       )
       UPDATE public.community_groups
          SET member_count = (SELECT n FROM new_count)
        WHERE id = $1::uuid
       RETURNING member_count`,
      groupId,
    );
    if (!count) throw new NotFoundException('Group not found.');
    return { left: true, memberCount: count.member_count };
  }

  async listPosts(
    userId: string,
    params: { groupId?: string; limit?: number } = {},
  ): Promise<CommunityPost[]> {
    const me = await this.myClientId(userId);
    const ws = await this.myWorkspaceId(userId);
    const limit = clamp(params.limit ?? 30, 1, 100);

    if (params.groupId) {
      return this.prisma.$queryRawUnsafe<CommunityPost[]>(
        `SELECT p.id, p.author_client_id, p.author_display_name, p.author_service_type,
                p.group_id, p.title, p.content, p.media_urls,
                p.likes_count, p.comments_count, p.pinned, p.created_at,
                EXISTS (
                  SELECT 1 FROM public.community_reactions r
                   WHERE r.target_type = 'post' AND r.target_id = p.id
                     AND r.client_id = $1::uuid
                ) AS i_reacted
           FROM public.community_posts p
          WHERE p.group_id = $2::uuid AND p.workspace_id = $4::uuid
          ORDER BY p.pinned DESC, p.created_at DESC
          LIMIT $3`,
        me,
        params.groupId,
        limit,
        ws,
      );
    }
    return this.prisma.$queryRawUnsafe<CommunityPost[]>(
      `SELECT p.id, p.author_client_id, p.author_display_name, p.author_service_type,
              p.group_id, p.title, p.content, p.media_urls,
              p.likes_count, p.comments_count, p.pinned, p.created_at,
              EXISTS (
                SELECT 1 FROM public.community_reactions r
                 WHERE r.target_type = 'post' AND r.target_id = p.id
                   AND r.client_id = $1::uuid
              ) AS i_reacted
         FROM public.community_posts p
        WHERE p.workspace_id = $3::uuid
          AND p.visibility = 'public'
          AND (p.group_id IS NULL OR EXISTS (
              SELECT 1 FROM public.community_group_members gm
               WHERE gm.group_id = p.group_id AND gm.client_id = $1::uuid AND gm.status = 'active'
          ))
        ORDER BY p.created_at DESC
        LIMIT $2`,
      me,
      limit,
      ws,
    );
  }

  async createPost(
    userId: string,
    body: { content: string; groupId?: string; title?: string },
  ): Promise<CommunityPost> {
    const me = await this.myClientId(userId);
    const ws = await this.myWorkspaceId(userId);
    const content = body.content.trim();
    if (!content) throw new BadRequestException('Post content cannot be empty.');
    if (content.length > 1000) throw new BadRequestException('Post too long (max 1000 characters).');

    // Block muted members from posting to groups they've been muted in.
    if (body.groupId) {
      const [mem] = await this.prisma.$queryRawUnsafe<Array<{ status: string }>>(
        `SELECT status FROM public.community_group_members
          WHERE group_id = $1::uuid AND client_id = $2::uuid LIMIT 1`,
        body.groupId,
        me,
      );
      if (mem?.status === 'muted') {
        throw new ForbiddenException('You are muted in this group.');
      }
    }

    // The community_posts table requires author_display_name — pull from clients.
    const [profile] = await this.prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM public.clients WHERE id = $1::uuid LIMIT 1`,
      me,
    );

    const [row] = await this.prisma.$queryRawUnsafe<CommunityPost[]>(
      `INSERT INTO public.community_posts
         (workspace_id, author_client_id, author_display_name, group_id, title, content, visibility)
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, 'public')
       RETURNING id, author_client_id, author_display_name, author_service_type,
                 group_id, title, content, media_urls,
                 likes_count, comments_count, pinned, created_at,
                 false AS i_reacted`,
      ws,
      me,
      profile?.name ?? 'Anonymous',
      body.groupId ?? null,
      body.title?.slice(0, 150) ?? null,
      content,
    );
    return row;
  }

  async toggleReaction(
    userId: string,
    postId: string,
    reaction: 'like' | 'love' | 'celebrate' = 'like',
  ): Promise<{ reacted: boolean; likesCount: number }> {
    const me = await this.myClientId(userId);

    // If we already reacted, remove it; otherwise insert one. likes_count
    // is updated atomically in the same statement so the read-back value
    // is consistent.
    const [existing] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.community_reactions
        WHERE target_type = 'post' AND target_id = $1::uuid AND client_id = $2::uuid
        LIMIT 1`,
      postId,
      me,
    );

    if (existing) {
      await this.prisma.$queryRawUnsafe(
        `DELETE FROM public.community_reactions WHERE id = $1::uuid`,
        existing.id,
      );
      const [post] = await this.prisma.$queryRawUnsafe<Array<{ likes_count: number }>>(
        `UPDATE public.community_posts
            SET likes_count = GREATEST(0, COALESCE(likes_count, 0) - 1)
          WHERE id = $1::uuid
         RETURNING likes_count`,
        postId,
      );
      return { reacted: false, likesCount: post?.likes_count ?? 0 };
    }

    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.community_reactions (client_id, target_type, target_id, reaction)
       VALUES ($1::uuid, 'post', $2::uuid, $3::public.community_reaction_type)`,
      me,
      postId,
      reaction,
    );
    const [post] = await this.prisma.$queryRawUnsafe<Array<{ likes_count: number }>>(
      `UPDATE public.community_posts
          SET likes_count = COALESCE(likes_count, 0) + 1
        WHERE id = $1::uuid
       RETURNING likes_count`,
      postId,
    );
    return { reacted: true, likesCount: post?.likes_count ?? 1 };
  }

  async listComments(postId: string, limit = 50): Promise<CommunityComment[]> {
    const lim = clamp(limit, 1, 200);
    return this.prisma.$queryRawUnsafe<CommunityComment[]>(
      `SELECT id, post_id, author_client_id, author_display_name, author_service_type,
              content, likes_count, created_at
         FROM public.community_comments
        WHERE post_id = $1::uuid
        ORDER BY created_at ASC
        LIMIT $2`,
      postId,
      lim,
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Moderation — pin, delete, kick, mute
  //
  // Resolves the caller's role inside a group from two truth sources:
  //   1. community_groups.owner_client_id  → 'owner'
  //   2. community_group_members.role      → 'owner' | 'moderator' | 'member'
  // We treat membership-table 'owner' the same as the owner_client_id check
  // since both can exist on the same row.
  // ─────────────────────────────────────────────────────────────────

  /** Returns the caller's role in this group, or 'none' if not a member. */
  private async groupRole(
    clientId: string,
    groupId: string,
  ): Promise<'owner' | 'moderator' | 'member' | 'none'> {
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{ is_owner: boolean; mem_role: string | null; mem_status: string | null }>
    >(
      `SELECT (g.owner_client_id = $1::uuid)      AS is_owner,
              gm.role::text                        AS mem_role,
              gm.status                            AS mem_status
         FROM public.community_groups g
         LEFT JOIN public.community_group_members gm
                ON gm.group_id = g.id AND gm.client_id = $1::uuid
        WHERE g.id = $2::uuid
        LIMIT 1`,
      clientId,
      groupId,
    );
    if (!row) return 'none';
    if (row.is_owner) return 'owner';
    if (row.mem_status !== 'active') return 'none';
    if (row.mem_role === 'moderator') return 'moderator';
    if (row.mem_role === 'owner')     return 'owner';
    if (row.mem_role === 'member')    return 'member';
    return 'none';
  }

  /** True for owner/moderator on this group. */
  private async canModerate(clientId: string, groupId: string): Promise<boolean> {
    const r = await this.groupRole(clientId, groupId);
    return r === 'owner' || r === 'moderator';
  }

  /**
   * Pin / unpin a post. Owner or moderator only. Global posts (group_id NULL)
   * can't be pinned — pinning is per-group surface.
   */
  async togglePinPost(userId: string, postId: string): Promise<{ pinned: boolean }> {
    const me = await this.myClientId(userId);
    const [post] = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; group_id: string | null; pinned: boolean }>
    >(
      `SELECT id, group_id, pinned FROM public.community_posts WHERE id = $1::uuid LIMIT 1`,
      postId,
    );
    if (!post) throw new NotFoundException('Post not found.');
    if (!post.group_id) {
      throw new BadRequestException('Global posts cannot be pinned. Pin only works inside a group.');
    }
    if (!(await this.canModerate(me, post.group_id))) {
      throw new ForbiddenException('You must be a moderator or the owner of this group to pin posts.');
    }
    const [updated] = await this.prisma.$queryRawUnsafe<Array<{ pinned: boolean }>>(
      `UPDATE public.community_posts
          SET pinned = NOT pinned, updated_at = now()
        WHERE id = $1::uuid
       RETURNING pinned`,
      postId,
    );
    await this.logAudit(me, updated.pinned ? 'post.pinned' : 'post.unpinned', 'community_posts', postId);
    return { pinned: updated.pinned };
  }

  /**
   * Delete a post. Allowed for:
   *   - the author
   *   - owner / moderator of the post's group (if it has a group)
   */
  async deletePost(userId: string, postId: string): Promise<{ deleted: true }> {
    const me = await this.myClientId(userId);
    const [post] = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; author_client_id: string; group_id: string | null }>
    >(
      `SELECT id, author_client_id, group_id FROM public.community_posts WHERE id = $1::uuid LIMIT 1`,
      postId,
    );
    if (!post) throw new NotFoundException('Post not found.');

    const isAuthor = post.author_client_id === me;
    const isMod = post.group_id ? await this.canModerate(me, post.group_id) : false;
    if (!isAuthor && !isMod) {
      throw new ForbiddenException('You can only delete your own posts, or any post inside a group you moderate.');
    }
    // ON DELETE CASCADE on comments + reactions means we don't need a tx here.
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.community_posts WHERE id = $1::uuid`,
      postId,
    );
    await this.logAudit(me, isAuthor ? 'post.deleted_self' : 'post.deleted_mod', 'community_posts', postId);
    return { deleted: true };
  }

  /**
   * Delete a comment. Allowed for the author, or owner/moderator of the
   * parent post's group.
   */
  async deleteComment(userId: string, commentId: string): Promise<{ deleted: true }> {
    const me = await this.myClientId(userId);
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; author_client_id: string; post_id: string; group_id: string | null }>
    >(
      `SELECT c.id, c.author_client_id, c.post_id, p.group_id
         FROM public.community_comments c
         JOIN public.community_posts p ON p.id = c.post_id
        WHERE c.id = $1::uuid
        LIMIT 1`,
      commentId,
    );
    if (!row) throw new NotFoundException('Comment not found.');

    const isAuthor = row.author_client_id === me;
    const isMod = row.group_id ? await this.canModerate(me, row.group_id) : false;
    if (!isAuthor && !isMod) {
      throw new ForbiddenException('You can only delete your own comments, or any comment inside a group you moderate.');
    }
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.community_comments WHERE id = $1::uuid`,
      commentId,
    );
    // Cheap denormalization — keep comments_count honest.
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.community_posts
          SET comments_count = GREATEST(0, COALESCE(comments_count, 0) - 1)
        WHERE id = $1::uuid`,
      row.post_id,
    );
    await this.logAudit(me, isAuthor ? 'comment.deleted_self' : 'comment.deleted_mod', 'community_comments', commentId);
    return { deleted: true };
  }

  /**
   * Kick a member out of a group. Owner can kick anyone; moderator can kick
   * members only (not other moderators or the owner).
   */
  async kickMember(
    userId: string,
    groupId: string,
    targetClientId: string,
  ): Promise<{ kicked: true; memberCount: number }> {
    const me = await this.myClientId(userId);
    const callerRole  = await this.groupRole(me, groupId);
    const targetRole  = await this.groupRole(targetClientId, groupId);

    if (callerRole === 'none' || callerRole === 'member') {
      throw new ForbiddenException('Only moderators or the owner can kick members.');
    }
    if (callerRole === 'moderator' && (targetRole === 'moderator' || targetRole === 'owner')) {
      throw new ForbiddenException('Moderators can only kick regular members.');
    }
    if (targetRole === 'owner') {
      throw new ForbiddenException('The group owner cannot be kicked.');
    }
    if (targetClientId === me) {
      throw new BadRequestException('Use the leave endpoint to remove yourself.');
    }

    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.community_group_members
        WHERE group_id = $1::uuid AND client_id = $2::uuid`,
      groupId,
      targetClientId,
    );
    const [count] = await this.prisma.$queryRawUnsafe<Array<{ member_count: number }>>(
      `WITH new_count AS (
         SELECT COUNT(*)::int AS n FROM public.community_group_members
          WHERE group_id = $1::uuid AND status = 'active'
       )
       UPDATE public.community_groups
          SET member_count = (SELECT n FROM new_count)
        WHERE id = $1::uuid
       RETURNING member_count`,
      groupId,
    );
    await this.logAudit(me, 'member.kicked', 'community_group_members', targetClientId);
    return { kicked: true, memberCount: count?.member_count ?? 0 };
  }

  /**
   * Mute a member — they stay in the group but lose the ability to post or
   * comment until unmuted. We use members.status = 'muted' as the flag
   * since the column is already there. Insert + post/comment RLS aside,
   * we also enforce here in createPost / createComment by checking status.
   */
  async setMemberStatus(
    userId: string,
    groupId: string,
    targetClientId: string,
    status: 'active' | 'muted',
  ): Promise<{ status: 'active' | 'muted' }> {
    const me = await this.myClientId(userId);
    if (!(await this.canModerate(me, groupId))) {
      throw new ForbiddenException('Only moderators or the owner can mute members.');
    }
    const targetRole = await this.groupRole(targetClientId, groupId);
    if (targetRole === 'owner') {
      throw new ForbiddenException('The group owner cannot be muted.');
    }
    if (targetRole === 'none') {
      throw new NotFoundException('Target is not a member of this group.');
    }
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `UPDATE public.community_group_members
          SET status = $3
        WHERE group_id = $1::uuid AND client_id = $2::uuid
       RETURNING status`,
      groupId,
      targetClientId,
      status,
    );
    await this.logAudit(me, status === 'muted' ? 'member.muted' : 'member.unmuted',
      'community_group_members', targetClientId);
    return { status: (row?.status ?? status) as 'active' | 'muted' };
  }

  /**
   * Promote a member to moderator (owner only) or demote back to member.
   */
  async setMemberRole(
    userId: string,
    groupId: string,
    targetClientId: string,
    role: 'member' | 'moderator',
  ): Promise<{ role: 'member' | 'moderator' }> {
    const me = await this.myClientId(userId);
    const callerRole = await this.groupRole(me, groupId);
    if (callerRole !== 'owner') {
      throw new ForbiddenException('Only the group owner can promote or demote moderators.');
    }
    const targetRole = await this.groupRole(targetClientId, groupId);
    if (targetRole === 'owner') {
      throw new ForbiddenException('Cannot change role on the owner row.');
    }
    if (targetRole === 'none') {
      throw new NotFoundException('Target is not a member of this group.');
    }
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ role: string }>>(
      `UPDATE public.community_group_members
          SET role = $3::public.community_group_role
        WHERE group_id = $1::uuid AND client_id = $2::uuid
       RETURNING role::text AS role`,
      groupId,
      targetClientId,
      role,
    );
    await this.logAudit(me, role === 'moderator' ? 'member.promoted' : 'member.demoted',
      'community_group_members', targetClientId);
    return { role: (row?.role ?? role) as 'member' | 'moderator' };
  }

  /**
   * List members of a group with their role + status. Member-only — anyone
   * outside the group can't enumerate the roster.
   */
  async listGroupMembers(
    userId: string,
    groupId: string,
  ): Promise<Array<{
    client_id: string; name: string; role: string; status: string; joined_at: string;
  }>> {
    const me = await this.myClientId(userId);
    const callerRole = await this.groupRole(me, groupId);
    if (callerRole === 'none') {
      throw new ForbiddenException('You must be a member of this group to see its roster.');
    }
    return this.prisma.$queryRawUnsafe<Array<{
      client_id: string; name: string; role: string; status: string; joined_at: string;
    }>>(
      `SELECT gm.client_id, c.name, gm.role::text AS role, gm.status, gm.joined_at
         FROM public.community_group_members gm
         JOIN public.clients c ON c.id = gm.client_id
        WHERE gm.group_id = $1::uuid
        ORDER BY (gm.role = 'owner') DESC,
                 (gm.role = 'moderator') DESC,
                 gm.joined_at ASC
        LIMIT 200`,
      groupId,
    );
  }

  /** Append-only audit row for moderation actions. Best-effort — failures are swallowed. */
  private async logAudit(
    actorClientId: string,
    action: string,
    targetTable: string,
    targetId: string,
  ): Promise<void> {
    try {
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO public.community_audit_logs
           (actor_client_id, action, target_table, target_id)
         VALUES ($1::uuid, $2, $3, $4::uuid)`,
        actorClientId,
        action,
        targetTable,
        targetId,
      );
    } catch (err) {
      this.logger.warn(`Audit log insert failed for ${action} ${targetId}: ${(err as Error).message}`);
    }
  }

  async createComment(
    userId: string,
    postId: string,
    content: string,
  ): Promise<CommunityComment> {
    const me = await this.myClientId(userId);
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Comment cannot be empty.');
    if (trimmed.length > 500) throw new BadRequestException('Comment too long (max 500 characters).');

    // Honour mute if the parent post lives inside a group.
    const [post] = await this.prisma.$queryRawUnsafe<Array<{
      group_id: string | null; workspace_id: string | null;
      author_user_id: string | null; author_client_id: string | null;
    }>>(
      `SELECT group_id, workspace_id, author_user_id, author_client_id
         FROM public.community_posts WHERE id = $1::uuid LIMIT 1`,
      postId,
    );
    if (post?.group_id) {
      const [mem] = await this.prisma.$queryRawUnsafe<Array<{ status: string }>>(
        `SELECT status FROM public.community_group_members
          WHERE group_id = $1::uuid AND client_id = $2::uuid LIMIT 1`,
        post.group_id,
        me,
      );
      if (mem?.status === 'muted') {
        throw new ForbiddenException('You are muted in this group.');
      }
    }

    const [profile] = await this.prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM public.clients WHERE id = $1::uuid LIMIT 1`,
      me,
    );

    const [row] = await this.prisma.$queryRawUnsafe<CommunityComment[]>(
      `INSERT INTO public.community_comments
         (post_id, author_client_id, author_display_name, content)
       VALUES ($1::uuid, $2::uuid, $3, $4)
       RETURNING id, post_id, author_client_id, author_display_name, author_service_type,
                 content, likes_count, created_at`,
      postId,
      me,
      profile?.name ?? 'Anonymous',
      trimmed,
    );

    // Cheap denormalization of comments_count on the parent post.
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.community_posts
          SET comments_count = COALESCE(comments_count, 0) + 1
        WHERE id = $1::uuid`,
      postId,
    );

    // Tell the post's author someone commented (never self-notify). Best-effort.
    if (post?.workspace_id) {
      const who = profile?.name ?? 'Someone';
      const preview = trimmed.length > 90 ? `${trimmed.slice(0, 90)}…` : trimmed;
      const n = {
        type: 'community:comment',
        title: '💬 New comment on your post',
        body: `${who}: ${preview}`,
        tag: `community-comment-${postId}`,
      };
      if (post.author_user_id) {
        void this.notifications.notifyUser(post.workspace_id, post.author_user_id, { ...n, url: '/community' });
      } else if (post.author_client_id && post.author_client_id !== me) {
        void this.notifications.notifyClient(post.workspace_id, post.author_client_id, { ...n, url: '/portal/community' });
      }
    }
    return row;
  }
}

// ─────────────────────────────────────────────────────────────────
// Types co-located with the service to keep clients.types.ts terse.
// ─────────────────────────────────────────────────────────────────

export type ChallengeMetric = 'water_ml' | 'exercise_minutes' | 'posts' | 'streak_days';

export interface CommunityGroup {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_image_url: string | null;
  is_private: boolean;
  member_count: number;
  is_member: boolean;
  /** Caller's effective role in the group, or null if not a member. */
  my_role: 'owner' | 'moderator' | 'member' | null;
  /** Caller's membership row status ('active'/'muted'), or null. */
  my_status: 'active' | 'muted' | null;
  created_at: string;
  // Challenge fields — non-null only when is_challenge = true.
  is_challenge: boolean;
  starts_at: string | null;
  ends_at: string | null;
  target_metric: ChallengeMetric | null;
  target_value: number | null;
}

export interface LeaderboardEntry {
  client_id: string;
  name: string;
  /** Caller's progress on the target_metric within [starts_at, ends_at]. */
  value: number;
  /** Rank starting at 1. */
  rank: number;
  is_me: boolean;
}

export interface CommunityPost {
  id: string;
  author_client_id: string;
  author_display_name: string;
  author_service_type: string | null;
  group_id: string | null;
  title: string | null;
  content: string;
  media_urls: unknown;
  likes_count: number;
  comments_count: number;
  pinned: boolean;
  created_at: string;
  i_reacted: boolean;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  author_client_id: string;
  author_display_name: string;
  author_service_type: string | null;
  content: string;
  likes_count: number;
  created_at: string;
}

export interface Appointment {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  kind: 'consultation' | 'follow_up' | 'check_in' | 'assessment' | 'group_session';
  mode: 'video' | 'phone' | 'in_person';
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'declined';
  meeting_url: string | null;
  location: string | null;
  notes: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

/** Appointment row enriched with the client's identity, for the workspace/owner views. */
export interface WorkspaceAppointment extends Appointment {
  client_id: string;
  client_name: string;
  client_avatar: string | null;
}

/** Everything the embedded meeting page needs to join the right room. */
export interface MeetingJoin {
  provider: 'jitsi' | 'daily'; // which embed the frontend should mount
  domain: string;        // 'meet.jit.si' (free public), '8x8.vc' (JaaS), or '<sub>.daily.co'
  room: string;          // room name/path (JaaS prefixes with the app id)
  room_url: string | null; // full room URL - Daily only
  jwt: string | null;    // signed join token (JaaS) or Daily meeting token
  mode: string;
  status: string;
  scheduled_at: string;
  duration_minutes: number;
  kind: string;
  other_name: string | null;
}

export interface HabitDay {
  date: string;
  water_ml: number;
  sleep_hours: number | null;
  exercise_minutes: number;
  weight_kg: number | null;
  mood: 'great' | 'good' | 'okay' | 'low' | null;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  earned_at: string | null;
  progress: number;
}

export interface Measurement {
  id: string;
  recorded_at: string;
  arm_inches: number | null;
  chest_inches: number | null;
  waist_inches: number | null;
  hip_inches: number | null;
  thigh_inches: number | null;
  notes: string | null;
}

export interface AssessmentCard {
  id: string;
  card_type: 'health_assessment' | 'stress_card' | 'sleep_card' | 'action_plan' | 'diet_plan' | 'custom_form';
  generated_content: Record<string, unknown>;
  status: 'pending' | 'edited' | 'sent';
  workflow_stage: string;
  sent_at: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
  has_responses: boolean;
}

export interface AssessmentForm {
  id: string;
  name: string;
  description: string | null;
  questions: TemplateQuestion[];
  status: 'draft' | 'published';
  created_at: string;
  updated_at: string;
}

export interface RecipeListItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  servings: number;
  total_kcal: number | null;
  video_url: string | null;
}

export interface RecipeIngredient {
  id: string;
  ingredient_id: string;
  name: string;
  quantity: number;
  unit: string;
  kcal_per_serving: number;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
}

export interface RecipeDetail extends RecipeListItem {
  instructions: string | null;
  ingredients: RecipeIngredient[];
}

export interface FileItem {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by?: string | null;
  created_at: string;
}

export interface ClientNote {
  id: string;
  content: string;
  admin_id: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Wave 1 — engagement + India types ─────────────────────────────────

export interface CycleEvent {
  id: string;
  event_type: 'period_start' | 'period_end' | 'ovulation' | 'pms' | 'cramps' | 'spotting';
  event_date: string;
  flow_level: number | null;
  notes: string | null;
}

export interface ProgressPhoto {
  id: string;
  taken_at: string;
  angle: 'front' | 'side' | 'back' | null;
  storage_key: string;
  weight_kg: number | null;
  notes: string | null;
}

export interface Symptom {
  id: string;
  occurred_at: string;
  symptom: string;
  severity: number;
  notes: string | null;
  suspected_trigger: string | null;
}

export interface Milestone {
  id: string;
  kind: string;
  value: number | null;
  achieved_at: string;
  celebrated: boolean;
  message: string | null;
}

export interface Supplement {
  id: string;
  name: string;
  dosage: string | null;
  schedule: string[];
  active: boolean;
  notes: string | null;
  created_at: string;
}

export interface Festival {
  name: string;
  tone: string;
  icon: string;
  /** YYYY-MM-DD */
  date: string;
}

export interface ConversationSummary {
  client_id: string;
  client_name: string;
  program: string;
  status: string | null;
  avatar_url: string | null;
  last_active_at: string | null;
  last_message: string | null;
  last_sender: 'admin' | 'client' | 'system' | null;
  last_message_at: string | null;
  unread: number;
}

export interface ThreadMessage {
  id: string;
  sender_type: 'admin' | 'client' | 'system';
  message_type: string;
  content: string;
  is_read: boolean;
  created_at: string;
  metadata?: unknown;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  attachment_size?: number | null;
}

/** Optional extras a send call can carry (attachment + reply-to + schedule). */
export interface SendOpts {
  content?: string;
  attachment?: { url: string; type: string; name?: string; size?: number };
  replyTo?: string;
  /** ISO timestamp — when set & in the future, the message is queued, not sent now. */
  scheduledFor?: string;
}

export interface QuickReply { id: string; label: string; body: string }

// Map legacy Sheizen icon_name strings (e.g. 'flame', 'droplet') to emojis
// so the frontend can render a calm, dependency-free badge grid. Anything
// not in here defaults to 🏆 (trophy).
const ICON_MAP: Record<string, string> = {
  flame: '🔥',
  droplet: '💧',
  trophy: '🏆',
  star: '⭐',
  utensils: '🍽️',
  activity: '🏃',
  award: '🏅',
  zap: '⚡',
  heart: '❤️',
  moon: '🌙',
  sun: '☀️',
  check: '✅',
  target: '🎯',
};

function labelForScore(score: number): string {
  if (score >= 85) return 'Glowing';
  if (score >= 70) return 'On track';
  if (score >= 50) return 'Building';
  if (score >= 25) return 'Slipping';
  return 'Restart today';
}

/**
 * "Living garden" state for the client home hero — a kinder, more motivating
 * replacement for the raw 0-100 number.
 *
 * Two independent inputs:
 *  - streakDays  → how ESTABLISHED the plant is (roots): seed → sprout → growing
 *                  → thriving → blooming. Even day one shows a hopeful sprout,
 *                  never "1/100 · Restart today".
 *  - todayCare   → 0..1, how well the plant was WATERED today (habits + meals).
 *                  Drives the soil-moisture bar and whether the copy is upbeat
 *                  ("reaching up") or a gentle nudge ("thirsty").
 */
function gardenState(
  streakDays: number,
  todayCare: number,
): {
  stage: 'seed' | 'sprout' | 'growing' | 'thriving' | 'blooming';
  stageLabel: string;
  emoji: string;
  headline: string;
  hint: string;
  growthPct: number;
  wateredToday: boolean;
} {
  const watered = todayCare >= 0.34;
  const growthPct = Math.max(0, Math.min(1, todayCare));

  let stage: 'seed' | 'sprout' | 'growing' | 'thriving' | 'blooming';
  let stageLabel: string;
  let emoji: string;
  let nextIn = 0; // days of streak until the next stage
  if (streakDays >= 14) {
    stage = 'blooming'; stageLabel = 'Blooming'; emoji = '🌸';
  } else if (streakDays >= 7) {
    stage = 'thriving'; stageLabel = 'Thriving'; emoji = '🪴'; nextIn = 14 - streakDays;
  } else if (streakDays >= 3) {
    stage = 'growing'; stageLabel = 'Growing'; emoji = '🌿'; nextIn = 7 - streakDays;
  } else if (streakDays >= 1) {
    stage = 'sprout'; stageLabel = 'Sprouting'; emoji = '🌱'; nextIn = 3 - streakDays;
  } else {
    stage = 'seed'; stageLabel = 'Seed'; emoji = '🌰';
  }

  const days = (n: number) => `${n} day${n > 1 ? 's' : ''}`;
  let headline: string;
  let hint: string;
  switch (stage) {
    case 'seed':
      headline = 'Plant your first seed';
      hint = 'Log water, a meal, or your sleep to start your garden';
      break;
    case 'sprout':
      headline = watered ? 'Your sprout is reaching up' : 'Your sprout is thirsty';
      hint = watered
        ? 'Lovely — come back tomorrow to keep it growing'
        : "Log today's water and a meal to help it grow";
      break;
    case 'growing':
      headline = watered ? 'Your garden is filling out' : 'Your leaves are drooping';
      hint = watered
        ? nextIn > 0 ? `Great care today — ${days(nextIn)} to Thriving` : 'Great care today — keep it up'
        : 'A little water today perks it right back up';
      break;
    case 'thriving':
      headline = watered ? 'Your garden is thriving' : 'Your garden misses you';
      hint = watered
        ? nextIn > 0 ? `On a roll — ${days(nextIn)} to full bloom` : 'On a roll — keep the streak alive'
        : 'Log something today to keep it thriving';
      break;
    case 'blooming':
      headline = watered ? 'In full bloom' : 'Your blooms need water';
      hint = watered ? "Beautiful — you're glowing today" : 'A quick log today keeps them open';
      break;
  }

  return { stage, stageLabel, emoji, headline, hint, growthPct, wateredToday: watered };
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/** Derive a message_type from an attachment's MIME (image/voice/file), else 'manual'. */
function msgTypeFor(attachment?: { type: string }): string {
  if (!attachment) return 'manual';
  if (attachment.type?.startsWith('image/')) return 'image';
  if (attachment.type?.startsWith('audio/')) return 'voice';
  return 'file';
}

/**
 * A unique, hard-to-guess video room hosted on the public Jitsi Meet instance.
 * We only store the URL; the app embeds it via the Jitsi IFrame API so the call
 * happens inside SIRAH LIFE. No accounts or API keys required.
 */
function meetingUrlFor(mode: string): string | null {
  if (mode !== 'video') return null;
  return `https://meet.jit.si/SirahLife-${randomBytes(9).toString('hex')}`;
}

/** The bare room id from a stored meeting URL (`https://.../SirahLife-abc` → `SirahLife-abc`). */
function roomFromUrl(meetingUrl: string | null): string | null {
  if (!meetingUrl) return null;
  try { return new URL(meetingUrl).pathname.replace(/^\/+/, '') || null; }
  catch { return meetingUrl.split('/').pop() || null; }
}

function labelForKind(kind: Appointment['kind']): string {
  switch (kind) {
    case 'consultation':  return 'Consultation';
    case 'follow_up':     return 'Follow-up';
    case 'check_in':      return 'Check-in';
    case 'assessment':    return 'Assessment';
    case 'group_session': return 'Group session';
    default:              return 'Appointment';
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // "Mon, Jun 9, 3:30 PM" — Asia/Kolkata default for the SIRAH LIFE audience.
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}