import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type {
  CreateOrgInput,
  OrganizationMember,
  OrganizationSummary,
  OrganizationWorkspace,
  OrgRole,
  UpdateOrgInput,
} from './organizations.types';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Org CRUD ──────────────────────────────────────────────────────

  async list(userId: string): Promise<OrganizationSummary[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string; name: string; slug: string;
        description: string | null; brand_color: string | null;
        logo_url: string | null; billing_email: string | null;
        created_at: Date; updated_at: Date;
        workspace_count: string; member_count: string;
        my_role: OrgRole;
      }>
    >(
      `SELECT o.id, o.name, o.slug, o.description, o.brand_color, o.logo_url,
              o.billing_email, o.created_at, o.updated_at,
              (SELECT COUNT(*)::text FROM public.workspaces w WHERE w.organization_id = o.id) AS workspace_count,
              (SELECT COUNT(*)::text FROM public.organization_members m WHERE m.organization_id = o.id AND m.status = 'active') AS member_count,
              me.role AS my_role
         FROM public.organizations o
         JOIN public.organization_members me ON me.organization_id = o.id AND me.user_id = $1::uuid AND me.status = 'active'
        ORDER BY o.name ASC`,
      userId,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      brand_color: r.brand_color,
      logo_url: r.logo_url,
      billing_email: r.billing_email,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
      workspace_count: Number(r.workspace_count),
      member_count: Number(r.member_count),
      my_role: r.my_role,
    }));
  }

  async get(userId: string, orgId: string): Promise<OrganizationSummary> {
    await this.assertMember(userId, orgId);
    const list = await this.list(userId);
    const hit = list.find((o) => o.id === orgId);
    if (!hit) throw new NotFoundException(`Organization ${orgId} not found.`);
    return hit;
  }

  async create(userId: string, input: CreateOrgInput): Promise<OrganizationSummary> {
    if (!input.name?.trim()) throw new BadRequestException('name is required.');
    if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(input.slug)) {
      throw new BadRequestException('slug must be 3-64 chars: lowercase, digits, hyphens.');
    }

    // Single transaction: create org + creator becomes org_owner.
    return this.prisma.$transaction(async (tx) => {
      const exists = await tx.organizations.findUnique({
        where: { slug: input.slug }, select: { id: true },
      });
      if (exists) throw new BadRequestException(`Slug "${input.slug}" is taken.`);

      const created = await tx.organizations.create({
        data: {
          name: input.name.trim(),
          slug: input.slug,
          description: input.description ?? null,
          brand_color: input.brand_color ?? null,
          billing_email: input.billing_email ?? null,
          created_by_user_id: userId,
        },
      });
      await tx.organization_members.create({
        data: {
          organization_id: created.id,
          user_id: userId,
          role: 'org_owner',
          status: 'active',
          invited_by: userId,
        },
      });

      return {
        id: created.id,
        name: created.name,
        slug: created.slug,
        description: created.description,
        brand_color: created.brand_color,
        logo_url: created.logo_url,
        billing_email: created.billing_email,
        created_at: created.created_at.toISOString(),
        updated_at: created.updated_at.toISOString(),
        workspace_count: 0,
        member_count: 1,
        my_role: 'org_owner' as const,
      };
    });
  }

  async update(
    userId: string, orgId: string, input: UpdateOrgInput,
  ): Promise<OrganizationSummary> {
    await this.assertRole(userId, orgId, ['org_owner', 'org_admin']);
    const patch: Prisma.organizationsUpdateInput = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.slug !== undefined) {
      if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(input.slug)) {
        throw new BadRequestException('slug must be 3-64 chars: lowercase, digits, hyphens.');
      }
      patch.slug = input.slug;
    }
    if (input.description !== undefined) patch.description = input.description;
    if (input.brand_color !== undefined) patch.brand_color = input.brand_color;
    if (input.logo_url !== undefined) patch.logo_url = input.logo_url;
    if (input.billing_email !== undefined) patch.billing_email = input.billing_email;
    await this.prisma.organizations.update({ where: { id: orgId }, data: patch });
    return this.get(userId, orgId);
  }

  async remove(userId: string, orgId: string): Promise<{ id: string }> {
    await this.assertRole(userId, orgId, ['org_owner']);
    // Detach workspaces — they survive as org-less, never delete tenant data
    // out from under members. Removing requires the owner to confirm.
    await this.prisma.$transaction([
      this.prisma.workspaces.updateMany({
        where: { organization_id: orgId },
        data: { organization_id: null },
      }),
      this.prisma.organizations.delete({ where: { id: orgId } }),
    ]);
    return { id: orgId };
  }

  // ── Members ───────────────────────────────────────────────────────

  async listMembers(userId: string, orgId: string): Promise<OrganizationMember[]> {
    await this.assertMember(userId, orgId);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string; organization_id: string; user_id: string;
        email: string | null; role: OrgRole; status: 'active' | 'invited' | 'revoked';
        invited_by: string | null; joined_at: Date;
      }>
    >(
      `SELECT m.id, m.organization_id, m.user_id,
              u.email::text AS email,
              m.role::text AS role,
              m.status::text AS status,
              m.invited_by,
              m.joined_at
         FROM public.organization_members m
         LEFT JOIN auth.users u ON u.id = m.user_id
        WHERE m.organization_id = $1::uuid
        ORDER BY m.joined_at ASC`,
      orgId,
    );
    return rows.map((r) => ({ ...r, joined_at: r.joined_at.toISOString() }));
  }

  async addMember(
    userId: string, orgId: string, memberEmail: string, role: OrgRole,
  ): Promise<OrganizationMember> {
    await this.assertRole(userId, orgId, ['org_owner', 'org_admin']);
    const target = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM auth.users WHERE email = $1 LIMIT 1`,
      memberEmail,
    );
    if (target.length === 0) {
      throw new NotFoundException(
        `No user with email ${memberEmail}. Have them sign up first.`,
      );
    }
    const targetId = target[0].id;

    const existing = await this.prisma.organization_members.findFirst({
      where: { organization_id: orgId, user_id: targetId },
    });
    if (existing) {
      throw new BadRequestException(`User is already a member (status=${existing.status}).`);
    }

    const row = await this.prisma.organization_members.create({
      data: {
        organization_id: orgId,
        user_id: targetId,
        role,
        status: 'active',
        invited_by: userId,
      },
    });
    const members = await this.listMembers(userId, orgId);
    return members.find((m) => m.id === row.id) ?? {
      id: row.id,
      organization_id: orgId,
      user_id: targetId,
      email: memberEmail,
      role,
      status: 'active',
      invited_by: userId,
      joined_at: row.joined_at.toISOString(),
    };
  }

  async updateMember(
    userId: string, orgId: string, memberId: string, role: OrgRole,
  ): Promise<OrganizationMember> {
    await this.assertRole(userId, orgId, ['org_owner']);
    const member = await this.prisma.organization_members.findFirst({
      where: { id: memberId, organization_id: orgId },
    });
    if (!member) throw new NotFoundException(`Member ${memberId} not found.`);
    await this.prisma.organization_members.update({
      where: { id: memberId },
      data: { role },
    });
    const list = await this.listMembers(userId, orgId);
    const hit = list.find((m) => m.id === memberId);
    if (!hit) throw new NotFoundException(`Member ${memberId} not found.`);
    return hit;
  }

  async removeMember(userId: string, orgId: string, memberId: string): Promise<{ id: string }> {
    await this.assertRole(userId, orgId, ['org_owner']);
    const member = await this.prisma.organization_members.findFirst({
      where: { id: memberId, organization_id: orgId },
    });
    if (!member) throw new NotFoundException(`Member ${memberId} not found.`);
    if (member.user_id === userId) {
      throw new BadRequestException('You cannot remove yourself. Transfer ownership first.');
    }
    await this.prisma.organization_members.delete({ where: { id: memberId } });
    return { id: memberId };
  }

  // ── Workspaces ────────────────────────────────────────────────────

  async listWorkspaces(userId: string, orgId: string): Promise<OrganizationWorkspace[]> {
    await this.assertMember(userId, orgId);
    const rows = await this.prisma.workspaces.findMany({
      where: { organization_id: orgId },
      orderBy: [{ name: 'asc' }],
      select: { id: true, name: true, organization_id: true, created_at: true },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      organization_id: r.organization_id as string,
      created_at: r.created_at.toISOString(),
    }));
  }

  async attachWorkspace(
    userId: string, orgId: string, workspaceId: string,
  ): Promise<OrganizationWorkspace> {
    await this.assertRole(userId, orgId, ['org_owner', 'org_admin']);
    // Caller must also be a member of the workspace they're attaching.
    const workspace = await this.prisma.workspaces.findUnique({
      where: { id: workspaceId },
      select: {
        id: true, name: true, organization_id: true, created_at: true,
        workspace_members: {
          where: { user_id: userId, status: 'active' },
          select: { role: true },
        },
      },
    });
    if (!workspace) throw new NotFoundException(`Workspace ${workspaceId} not found.`);
    if (workspace.workspace_members.length === 0) {
      throw new ForbiddenException(`You are not a member of workspace ${workspaceId}.`);
    }
    if (workspace.organization_id && workspace.organization_id !== orgId) {
      throw new BadRequestException(
        `Workspace already belongs to a different organization. Detach it first.`,
      );
    }
    await this.prisma.workspaces.update({
      where: { id: workspaceId },
      data: { organization_id: orgId },
    });
    return {
      id: workspace.id,
      name: workspace.name,
      organization_id: orgId,
      created_at: workspace.created_at.toISOString(),
    };
  }

  async detachWorkspace(userId: string, orgId: string, workspaceId: string): Promise<{ id: string }> {
    await this.assertRole(userId, orgId, ['org_owner', 'org_admin']);
    const workspace = await this.prisma.workspaces.findFirst({
      where: { id: workspaceId, organization_id: orgId },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException(`Workspace ${workspaceId} not attached to this org.`);
    await this.prisma.workspaces.update({
      where: { id: workspaceId },
      data: { organization_id: null },
    });
    return { id: workspaceId };
  }

  // ── Guards ────────────────────────────────────────────────────────

  /**
   * Public membership check for cross-module callers (e.g. the org activity
   * audit endpoint, which lives on this controller but delegates the feed read
   * to ActivityLogService). Returns the caller's role; throws if not a member.
   */
  async requireMembership(userId: string, orgId: string): Promise<OrgRole> {
    return this.assertMember(userId, orgId);
  }

  private async assertMember(userId: string, orgId: string): Promise<OrgRole> {
    const row = await this.prisma.organization_members.findFirst({
      where: { user_id: userId, organization_id: orgId, status: 'active' },
      select: { role: true },
    });
    if (!row) throw new ForbiddenException('Not an active member of this organization.');
    return row.role as OrgRole;
  }

  private async assertRole(
    userId: string, orgId: string, roles: OrgRole[],
  ): Promise<void> {
    const role = await this.assertMember(userId, orgId);
    if (!roles.includes(role)) {
      throw new ForbiddenException(`Requires one of: ${roles.join(', ')}.`);
    }
  }
}
