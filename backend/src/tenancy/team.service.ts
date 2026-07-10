import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { LimitsService } from './limits.service';
import { MailService } from '../mail/mail.service';

/** Staff roles that may be granted via invite (owner is the workspace creator). */
export const INVITABLE_ROLES = [
  'manager', 'nutritionist', 'assistant_nutritionist', 'receptionist', 'coach', 'support',
] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

/** All assignable member roles (owner included, for role changes). */
export const MEMBER_ROLES = ['owner', ...INVITABLE_ROLES] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export interface TeamMember {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
  status: string;
  joined_at: string;
}

export interface WorkspaceInvite {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface TeamInvitePreview {
  workspace_name: string;
  role: string;
  invited_by_email: string | null;
  expires_at: string;
  valid: boolean;
  reason?: string;
}

/**
 * TeamService — workspace staff: members + token invitations (Module 2 Team
 * Management). Mirrors the client-invite flow, but grants a workspace_member
 * role on accept and is gated by the plan's team-size limit.
 */
@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  private readonly supabaseUrl: string;
  private readonly serviceKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.supabaseUrl = config.getOrThrow<string>('SUPABASE_URL');
    this.serviceKey = config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');
  }

  // ── Members ────────────────────────────────────────────────────────

  async listMembers(workspaceId: string): Promise<TeamMember[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; user_id: string; email: string | null; role: string; status: string; joined_at: Date }>
    >(
      `SELECT wm.id, wm.user_id, u.email::text AS email,
              wm.role::text AS role, wm.status, wm.joined_at
         FROM public.workspace_members wm
         LEFT JOIN auth.users u ON u.id = wm.user_id
        WHERE wm.workspace_id = $1::uuid
        ORDER BY (wm.role = 'owner') DESC, wm.joined_at ASC`,
      workspaceId,
    );
    return rows.map((r) => ({ ...r, joined_at: r.joined_at.toISOString() }));
  }

  async updateMemberRole(workspaceId: string, memberId: string, role: string): Promise<TeamMember> {
    if (!(MEMBER_ROLES as readonly string[]).includes(role)) {
      throw new BadRequestException(`Invalid role "${role}".`);
    }
    const [member] = await this.prisma.$queryRawUnsafe<Array<{ id: string; role: string; user_id: string }>>(
      `SELECT id, role::text AS role, user_id FROM public.workspace_members
        WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
      memberId,
      workspaceId,
    );
    if (!member) throw new NotFoundException('Member not found in this workspace.');
    // Don't allow demoting the last owner — the workspace must keep one.
    if (member.role === 'owner' && role !== 'owner') {
      await this.assertNotLastOwner(workspaceId, memberId);
    }
    // Promoting a non-manager into manager consumes a manager seat.
    if (role === 'manager' && member.role !== 'manager') {
      await this.limits.assertCanAddManager(workspaceId);
    }
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.workspace_members
          SET role = $3::public.workspace_member_role, updated_at = now()
        WHERE id = $1::uuid AND workspace_id = $2::uuid`,
      memberId,
      workspaceId,
      role,
    );
    const members = await this.listMembers(workspaceId);
    const hit = members.find((m) => m.id === memberId);
    if (!hit) throw new NotFoundException('Member not found.');
    return hit;
  }

  async removeMember(workspaceId: string, memberId: string, actorUserId: string): Promise<{ id: string }> {
    const [member] = await this.prisma.$queryRawUnsafe<Array<{ id: string; role: string; user_id: string }>>(
      `SELECT id, role::text AS role, user_id FROM public.workspace_members
        WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
      memberId,
      workspaceId,
    );
    if (!member) throw new NotFoundException('Member not found in this workspace.');
    if (member.user_id === actorUserId) {
      throw new BadRequestException('You cannot remove yourself from the workspace.');
    }
    if (member.role === 'owner') {
      await this.assertNotLastOwner(workspaceId, memberId);
    }
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.workspace_members WHERE id = $1::uuid AND workspace_id = $2::uuid`,
      memberId,
      workspaceId,
    );
    return { id: memberId };
  }

  // ── Invites ────────────────────────────────────────────────────────

  async listInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
    const rows = await this.prisma.$queryRawUnsafe<RawInvite[]>(
      `SELECT id, workspace_id, email, role::text AS role, token, status,
              invited_by, expires_at, accepted_at, created_at
         FROM public.workspace_invites
        WHERE workspace_id = $1::uuid
        ORDER BY created_at DESC`,
      workspaceId,
    );
    return rows.map(toInvite);
  }

  async inviteMember(
    workspaceId: string,
    invitedBy: string,
    email: string,
    role: string,
    notes?: string,
  ): Promise<WorkspaceInvite> {
    const normalized = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      throw new BadRequestException('Invalid email.');
    }
    if (!(INVITABLE_ROLES as readonly string[]).includes(role)) {
      throw new BadRequestException(`Role must be one of: ${INVITABLE_ROLES.join(', ')}.`);
    }

    // Team-size quota check (counts active members + pending invites).
    await this.limits.assertCanAddTeamMember(workspaceId);
    // Manager is a plan-gated sub-role with its own per-plan cap.
    if (role === 'manager') {
      await this.limits.assertCanAddManager(workspaceId);
    }

    // Already an active member?
    const existingMember = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT wm.id FROM public.workspace_members wm
         JOIN auth.users u ON u.id = wm.user_id
        WHERE wm.workspace_id = $1::uuid AND lower(u.email) = $2 AND wm.status = 'active'
        LIMIT 1`,
      workspaceId,
      normalized,
    );
    if (existingMember.length) {
      throw new ConflictException('This person is already a member of the workspace.');
    }

    const token = randomBytes(32).toString('hex');
    try {
      const rows = await this.prisma.$queryRawUnsafe<RawInvite[]>(
        `INSERT INTO public.workspace_invites (workspace_id, email, role, token, invited_by, notes)
         VALUES ($1::uuid, $2, $3::public.workspace_member_role, $4, $5::uuid, $6)
         RETURNING id, workspace_id, email, role::text AS role, token, status,
                   invited_by, expires_at, accepted_at, created_at`,
        workspaceId,
        normalized,
        role,
        token,
        invitedBy,
        notes ?? null,
      );
      // Fire the invite email without blocking the response — the owner can
      // always copy the share link if email isn't configured / fails.
      void this.sendInviteEmail(workspaceId, invitedBy, normalized, role, token);
      return toInvite(rows[0]);
    } catch (err) {
      if (/duplicate key|unique/i.test((err as Error).message)) {
        throw new ConflictException('A pending invite already exists for this email.');
      }
      throw err;
    }
  }

  /**
   * Provision a staff login directly with an email + password — no email
   * round-trip. Creates the Supabase auth account (or reuses an existing one),
   * then adds the person as an ACTIVE workspace member. The owner shares the
   * credentials; the new member can sign in immediately.
   */
  async createMemberDirect(
    workspaceId: string,
    _invitedBy: string,
    email: string,
    password: string,
    role: string,
  ): Promise<{ user_id: string; email: string; role: string; created: boolean }> {
    const normalized = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new BadRequestException('Invalid email.');
    if (!(INVITABLE_ROLES as readonly string[]).includes(role)) {
      throw new BadRequestException(`Role must be one of: ${INVITABLE_ROLES.join(', ')}.`);
    }
    if (!password || password.length < 8) throw new BadRequestException('Password must be at least 8 characters.');

    // Plan quotas — active members + pending invites, plus the manager sub-cap.
    await this.limits.assertCanAddTeamMember(workspaceId);
    if (role === 'manager') await this.limits.assertCanAddManager(workspaceId);

    // Already an active member of THIS workspace?
    const existingMember = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT wm.id FROM public.workspace_members wm
         JOIN auth.users u ON u.id = wm.user_id
        WHERE wm.workspace_id = $1::uuid AND lower(u.email) = $2 AND wm.status = 'active'
        LIMIT 1`,
      workspaceId,
      normalized,
    );
    if (existingMember.length) throw new ConflictException('This person is already a member of the workspace.');

    // Create the login, or reuse an existing account with that email.
    let userId: string;
    let created = false;
    try {
      const res = (await this.callSupabaseAdmin('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: normalized, password, email_confirm: true }),
      })) as { id: string };
      userId = res.id;
      created = true;
    } catch (err) {
      const msg = (err as Error).message;
      if (!/already (been )?registered|email.*exists|has already/i.test(msg)) throw err;
      // Existing account — link it (its password is NOT changed).
      const list = (await this.callSupabaseAdmin(
        `/auth/v1/admin/users?filter=email.eq.${encodeURIComponent(normalized)}`,
      )) as { users?: Array<{ id: string; email?: string }> };
      const found = (list.users ?? []).find((u) => u.email?.toLowerCase() === normalized);
      if (!found) throw new BadRequestException(`Could not find an existing account for ${normalized}.`);
      userId = found.id;
    }

    // Add (or reactivate) as an active workspace member.
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO public.workspace_members (workspace_id, user_id, role, status, invited_at, joined_at)
       VALUES ($1::uuid, $2::uuid, $3::public.workspace_member_role, 'active', now(), now())
       ON CONFLICT (workspace_id, user_id) DO UPDATE
         SET role = EXCLUDED.role, status = 'active', updated_at = now()`,
      workspaceId,
      userId,
      role,
    );

    return { user_id: userId, email: normalized, role, created };
  }

  /** Call the Supabase admin (service-role) REST API. */
  private async callSupabaseAdmin(path: string, init: RequestInit = {}): Promise<unknown> {
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
      throw new BadRequestException(`Supabase admin API ${res.status}: ${obj?.msg || obj?.message || obj?.error_description || text}`);
    }
    return json;
  }

  /** Resolve workspace/inviter context and email the invite link (best-effort). */
  private async sendInviteEmail(
    workspaceId: string,
    invitedBy: string,
    email: string,
    role: string,
    token: string,
  ): Promise<void> {
    try {
      const origin = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:4000').split(',')[0].trim();
      const inviteUrl = `${origin}/team-invite/${token}`;
      const [ws] = await this.prisma.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT name FROM public.workspaces WHERE id = $1::uuid`,
        workspaceId,
      );
      const [inviter] = await this.prisma.$queryRawUnsafe<Array<{ email: string | null }>>(
        `SELECT email::text AS email FROM auth.users WHERE id = $1::uuid`,
        invitedBy,
      );
      await this.mail.sendTeamInvite({
        to: email,
        inviteUrl,
        workspaceName: ws?.name ?? 'your workspace',
        role,
        inviterEmail: inviter?.email ?? null,
      });
    } catch (err) {
      this.logger.warn(`Team invite email failed: ${(err as Error).message}`);
    }
  }

  async revokeInvite(workspaceId: string, inviteId: string, actor: string): Promise<{ id: string }> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE public.workspace_invites
          SET status = 'revoked', revoked_at = now(), revoked_by = $3::uuid, updated_at = now()
        WHERE id = $1::uuid AND workspace_id = $2::uuid AND status = 'pending'
       RETURNING id`,
      inviteId,
      workspaceId,
      actor,
    );
    if (!rows.length) throw new NotFoundException('Invite not found or already finalised.');
    return { id: rows[0].id };
  }

  async previewInvite(token: string): Promise<TeamInvitePreview> {
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{
        role: string; status: string; expires_at: Date;
        workspace_name: string; invited_by_email: string | null;
      }>
    >(
      `SELECT i.role::text AS role, i.status, i.expires_at,
              w.name AS workspace_name,
              u.email::text AS invited_by_email
         FROM public.workspace_invites i
         JOIN public.workspaces w ON w.id = i.workspace_id
         LEFT JOIN auth.users u ON u.id = i.invited_by
        WHERE i.token = $1
        LIMIT 1`,
      token,
    );
    if (!row) throw new NotFoundException('Invite not found.');
    const expired = row.expires_at.getTime() < Date.now();
    const valid = row.status === 'pending' && !expired;
    return {
      workspace_name: row.workspace_name,
      role: row.role,
      invited_by_email: row.invited_by_email,
      expires_at: row.expires_at.toISOString(),
      valid,
      reason: valid ? undefined : expired ? 'expired' : row.status,
    };
  }

  /** Accept a staff invite — creates/activates the workspace membership. */
  async acceptInvite(token: string, userId: string): Promise<{ workspaceId: string; role: string }> {
    const [invite] = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; workspace_id: string; role: string; status: string; expires_at: Date }>
    >(
      `SELECT id, workspace_id, role::text AS role, status, expires_at
         FROM public.workspace_invites WHERE token = $1 LIMIT 1`,
      token,
    );
    if (!invite) throw new NotFoundException('Invite not found.');
    if (invite.status !== 'pending') throw new BadRequestException(`Invite is ${invite.status}.`);
    if (invite.expires_at.getTime() < Date.now()) {
      throw new BadRequestException('Invite has expired.');
    }

    // Re-check the team quota at accept time (limit may have tightened).
    await this.limits.assertCanAddTeamMember(invite.workspace_id);
    if (invite.role === 'manager') {
      await this.limits.assertCanAddManager(invite.workspace_id);
    }

    await this.prisma.$transaction(async (tx) => {
      // Idempotent membership: re-activate if a row already exists.
      await tx.$queryRawUnsafe(
        `INSERT INTO public.workspace_members (workspace_id, user_id, role, status, invited_at, joined_at)
         VALUES ($1::uuid, $2::uuid, $3::public.workspace_member_role, 'active', now(), now())
         ON CONFLICT (workspace_id, user_id) DO UPDATE
           SET role = EXCLUDED.role, status = 'active', updated_at = now()`,
        invite.workspace_id,
        userId,
        invite.role,
      );
      await tx.$queryRawUnsafe(
        `UPDATE public.workspace_invites
            SET status = 'accepted', accepted_user_id = $2::uuid, accepted_at = now(), updated_at = now()
          WHERE id = $1::uuid`,
        invite.id,
        userId,
      );
    });

    return { workspaceId: invite.workspace_id, role: invite.role };
  }

  // ── Internal ───────────────────────────────────────────────────────

  private async assertNotLastOwner(workspaceId: string, excludingMemberId: string): Promise<void> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ owners: bigint }>>(
      `SELECT count(*) AS owners FROM public.workspace_members
        WHERE workspace_id = $1::uuid AND role = 'owner' AND status = 'active' AND id <> $2::uuid`,
      workspaceId,
      excludingMemberId,
    );
    if (Number(row?.owners ?? 0n) === 0) {
      throw new ForbiddenException('A workspace must keep at least one owner.');
    }
  }
}

interface RawInvite {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  invited_by: string | null;
  expires_at: Date;
  accepted_at: Date | null;
  created_at: Date;
}

function toInvite(r: RawInvite): WorkspaceInvite {
  return {
    id: r.id,
    workspace_id: r.workspace_id,
    email: r.email,
    role: r.role,
    token: r.token,
    status: r.status,
    invited_by: r.invited_by,
    expires_at: r.expires_at.toISOString(),
    accepted_at: r.accepted_at ? r.accepted_at.toISOString() : null,
    created_at: r.created_at.toISOString(),
  };
}
