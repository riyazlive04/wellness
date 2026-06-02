import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ListWorkspacesQuery } from './dto/list-workspaces.query';

export interface WorkspaceListItem {
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  status: 'active' | 'suspended' | 'deleted';
  trial_ends_at: Date;
  created_at: Date;
  owner_id: string;
  owner_email: string | null;
  /** Count of active workspace_members rows. */
  member_count: number;
}

export interface ListWorkspacesResult {
  items: WorkspaceListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface PlatformStats {
  workspaces: {
    total: number;
    active: number;
    suspended: number;
    deleted: number;
    trial: number;
    /** Workspaces whose trial ends within 7 days. */
    trialExpiringSoon: number;
    /** Created in the last 30 days. */
    createdLast30d: number;
  };
  members: {
    total: number;
    owners: number;
  };
  // Reserved for future:
  // revenue: { mrr: number; arr: number; }
  // aiUsage: { gptCalls7d: number; voiceMin7d: number; visionCalls7d: number; }
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(): Promise<PlatformStats> {
    // All counts in one round-trip via Promise.all + raw SQL where it's
    // cheaper than multiple Prisma calls. Read-only, no joins.
    const [byStatus, byPlan, soon, last30d, totalMembers, totalOwners] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ status: string; n: bigint }>>(
        `SELECT status, COUNT(*)::bigint AS n FROM public.workspaces GROUP BY status`,
      ),
      this.prisma.$queryRawUnsafe<Array<{ plan: string; n: bigint }>>(
        `SELECT plan, COUNT(*)::bigint AS n FROM public.workspaces GROUP BY plan`,
      ),
      this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT COUNT(*)::bigint AS n FROM public.workspaces
           WHERE status='active'
             AND trial_ends_at BETWEEN now() AND now() + interval '7 days'`,
      ),
      this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT COUNT(*)::bigint AS n FROM public.workspaces
           WHERE created_at >= now() - interval '30 days'`,
      ),
      this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT COUNT(*)::bigint AS n FROM public.workspace_members
           WHERE status='active'`,
      ),
      this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT COUNT(*)::bigint AS n FROM public.workspace_members
           WHERE status='active' AND role='owner'`,
      ),
    ]);

    const statusN = (s: string) =>
      Number(byStatus.find((r) => r.status === s)?.n ?? 0n);
    const planN = (p: string) =>
      Number(byPlan.find((r) => r.plan === p)?.n ?? 0n);
    const total = byStatus.reduce((acc, r) => acc + Number(r.n), 0);

    return {
      workspaces: {
        total,
        active:    statusN('active'),
        suspended: statusN('suspended'),
        deleted:   statusN('deleted'),
        trial:     planN('trial'),
        trialExpiringSoon: Number(soon[0]?.n ?? 0n),
        createdLast30d:    Number(last30d[0]?.n ?? 0n),
      },
      members: {
        total:  Number(totalMembers[0]?.n ?? 0n),
        owners: Number(totalOwners[0]?.n ?? 0n),
      },
    };
  }

  async listWorkspaces(q: ListWorkspacesQuery): Promise<ListWorkspacesResult> {
    const limit  = q.limit  ?? 50;
    const offset = q.offset ?? 0;
    const status = q.status && q.status !== 'all' ? q.status : null;
    const plan   = q.plan ?? null;
    const search = q.q ? `%${q.q.toLowerCase()}%` : null;

    // Single query with COUNT() OVER() to return total + page in one round trip.
    // Joins auth.users for owner email (cheaper than two separate queries).
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        name: string;
        slug: string | null;
        plan: string;
        status: 'active' | 'suspended' | 'deleted';
        trial_ends_at: Date;
        created_at: Date;
        owner_id: string;
        owner_email: string | null;
        member_count: bigint;
        total_count: bigint;
      }>
    >(
      `SELECT w.id, w.name, w.slug, w.plan, w.status, w.trial_ends_at, w.created_at,
              w.owner_id,
              u.email AS owner_email,
              COALESCE((
                SELECT COUNT(*)::bigint
                  FROM public.workspace_members m
                 WHERE m.workspace_id = w.id AND m.status = 'active'
              ), 0) AS member_count,
              COUNT(*) OVER() AS total_count
         FROM public.workspaces w
         LEFT JOIN auth.users u ON u.id = w.owner_id
        WHERE ($1::text IS NULL OR w.status::text = $1)
          AND ($2::text IS NULL OR w.plan = $2)
          AND ($3::text IS NULL
                OR LOWER(w.name) LIKE $3
                OR LOWER(COALESCE(u.email, '')) LIKE $3)
        ORDER BY w.created_at DESC
        LIMIT $4 OFFSET $5`,
      status, plan, search, limit, offset,
    );

    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        plan: r.plan,
        status: r.status,
        trial_ends_at: r.trial_ends_at,
        created_at: r.created_at,
        owner_id: r.owner_id,
        owner_email: r.owner_email,
        member_count: Number(r.member_count),
      })),
      total: rows.length > 0 ? Number(rows[0].total_count) : 0,
      limit,
      offset,
    };
  }

  async suspend(id: string): Promise<{ id: string; status: 'suspended' }> {
    await this.requireExists(id);
    await this.prisma.workspaces.update({
      where: { id },
      data: { status: 'suspended' },
    });
    return { id, status: 'suspended' };
  }

  async activate(id: string): Promise<{ id: string; status: 'active' }> {
    await this.requireExists(id);
    await this.prisma.workspaces.update({
      where: { id },
      data: { status: 'active' },
    });
    return { id, status: 'active' };
  }

  /** Soft delete — sets status='deleted'. Hard delete is a separate concern. */
  async softDelete(id: string): Promise<{ id: string; status: 'deleted' }> {
    await this.requireExists(id);
    await this.prisma.workspaces.update({
      where: { id },
      data: { status: 'deleted' },
    });
    return { id, status: 'deleted' };
  }

  private async requireExists(id: string): Promise<void> {
    const exists = await this.prisma.workspaces.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Workspace ${id} not found.`);
  }
}
