import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthCacheService } from '../auth/auth-cache.service';
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

export interface WorkspaceDetail extends WorkspaceListItem {
  contact_email: string | null;
  contact_phone: string | null;
  city: string | null;
  country_code: string | null;
  gstin: string | null;
  pan: string | null;
  members: Array<{
    user_id: string;
    email: string | null;
    role: string;
    status: string;
    joined_at: Date;
  }>;
  /** Owner's display name, for addressing them in the admin UI. */
  owner_name: string | null;
  /**
   * The parts the super admin actually acts on: is this practice being used,
   * what will it be charged, what has been done to it, and which clients are
   * slipping. The list already computes most of this; the detail page used to
   * show none of it.
   */
  activity: {
    meals_7d: number;
    messages_7d: number;
    clients_active_7d: number;
    ai_calls_30d: number;
    ai_limit: number | null;
    last_active: Date | null;
  };
  billing: {
    setup_fee_inr: number;
    setup_plan: string | null;
    setup_paid_at: Date | null;
    lifetime_paid_inr: number;
    payment_count: number;
    failed_30d: number;
    subscription_status: string | null;
    current_period_end: Date | null;
    manual_renewal: boolean;
  };
  /** Most recent admin actions on this practice, newest first. */
  events: Array<{ action: string; actor_email: string | null; created_at: Date }>;
  /** Clients, newest activity first — who is engaged and who has gone quiet. */
  clients_list: Array<{
    id: string;
    name: string | null;
    last_log_at: Date | null;
    meals_7d: number;
  }>;
  /** Counts of tenant data (programs, clients, etc.) tied to this workspace. */
  counts: {
    members: number;
    clients: number;
    programs: number;
    appointments: number;
    meal_logs: number;
    assessments: number;
  };
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
    /** Practices with a current paid subscription (₹1 tests excluded). */
    paying: number;
    /** NUSI's own and complimentary practices (billing_exempt). */
    complimentary: number;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly authCache: AuthCacheService,
  ) {}

  /**
   * Platform counts for the Overview. Closed (deleted) practices are left out
   * of every count except `deleted`; "trial" means still inside the 14 days
   * with no paid plan (paying practices keep plan='trial' in the column, so the
   * column alone can't tell); complimentary / NUSI-own practices are counted
   * on their own.
   */
  async stats(): Promise<PlatformStats> {
    const PAID = `EXISTS (SELECT 1 FROM public.subscriptions s
                           WHERE s.workspace_id = w.id AND s.status = 'active' AND NOT s.is_test)`;
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{
        total: bigint; active: bigint; suspended: bigint; deleted: bigint;
        trial: bigint; trial_soon: bigint; paying: bigint; exempt: bigint; new_30d: bigint;
        members: bigint; owners: bigint;
      }>
    >(`
      SELECT
        COUNT(*) FILTER (WHERE w.status <> 'deleted')::bigint AS total,
        COUNT(*) FILTER (WHERE w.status = 'active')::bigint AS active,
        COUNT(*) FILTER (WHERE w.status = 'suspended')::bigint AS suspended,
        COUNT(*) FILTER (WHERE w.status = 'deleted')::bigint AS deleted,
        COUNT(*) FILTER (WHERE w.status = 'active' AND NOT w.billing_exempt
                           AND w.trial_ends_at > now() AND NOT ${PAID})::bigint AS trial,
        COUNT(*) FILTER (WHERE w.status = 'active' AND NOT w.billing_exempt AND NOT ${PAID}
                           AND w.trial_ends_at BETWEEN now() AND now() + interval '7 days')::bigint AS trial_soon,
        COUNT(*) FILTER (WHERE w.status <> 'deleted' AND NOT w.billing_exempt AND ${PAID})::bigint AS paying,
        COUNT(*) FILTER (WHERE w.status <> 'deleted' AND w.billing_exempt)::bigint AS exempt,
        COUNT(*) FILTER (WHERE w.status <> 'deleted' AND w.created_at >= now() - interval '30 days')::bigint AS new_30d,
        (SELECT COUNT(DISTINCT m.user_id) FROM public.workspace_members m
           JOIN public.workspaces mw ON mw.id = m.workspace_id
          WHERE m.status = 'active' AND mw.status <> 'deleted')::bigint AS members,
        (SELECT COUNT(DISTINCT m.user_id) FROM public.workspace_members m
           JOIN public.workspaces mw ON mw.id = m.workspace_id
          WHERE m.status = 'active' AND m.role = 'owner' AND mw.status <> 'deleted')::bigint AS owners
      FROM public.workspaces w
    `);
    const n = (v: bigint | undefined) => Number(v ?? 0n);
    return {
      workspaces: {
        total: n(row?.total),
        active: n(row?.active),
        suspended: n(row?.suspended),
        deleted: n(row?.deleted),
        trial: n(row?.trial),
        trialExpiringSoon: n(row?.trial_soon),
        paying: n(row?.paying),
        complimentary: n(row?.exempt),
        createdLast30d: n(row?.new_30d),
      },
      members: {
        total: n(row?.members),
        owners: n(row?.owners),
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

  /**
   * Full workspace detail for the platform-admin drilldown page. Aggregates
   * the workspace row, owner email, member list, and counts of tenant data
   * scoped to this workspace. One query per count to keep the logic readable —
   * counts table list intentionally covers the 6 most useful tenant tables;
   * extend as needed.
   */
  async workspaceDetail(id: string): Promise<WorkspaceDetail> {
    const ws = await this.prisma.workspaces.findUnique({
      where: { id },
      include: { users: true }, // owner relation (if Prisma name matches)
    }).catch(() => null) ??
      (await this.prisma.workspaces.findUnique({ where: { id } }));
    if (!ws) throw new NotFoundException(`Workspace ${id} not found.`);

    const ownerRows = await this.prisma.$queryRawUnsafe<Array<{ email: string | null; full_name: string | null }>>(
      `SELECT email,
              COALESCE(NULLIF(raw_user_meta_data->>'full_name',''),
                       NULLIF(raw_user_meta_data->>'name','')) AS full_name
         FROM auth.users WHERE id = $1::uuid`,
      ws.owner_id,
    );
    const owner_email = ownerRows[0]?.email ?? null;

    const memberRows = await this.prisma.$queryRawUnsafe<
      Array<{
        user_id: string;
        email: string | null;
        role: string;
        status: string;
        joined_at: Date;
      }>
    >(
      `SELECT m.user_id, u.email, m.role::text AS role, m.status::text AS status, m.joined_at
         FROM public.workspace_members m
         LEFT JOIN auth.users u ON u.id = m.user_id
        WHERE m.workspace_id = $1::uuid
        ORDER BY m.joined_at ASC`,
      id,
    );

    // Counts of tenant data — one query each. Safe: ignores tables that
    // don't yet have rows for this workspace.
    const countTable = async (table: string): Promise<number> => {
      try {
        const rows = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
          `SELECT COUNT(*)::bigint AS n FROM public.${table} WHERE workspace_id = $1::uuid`,
          id,
        );
        return Number(rows[0]?.n ?? 0n);
      } catch {
        return 0;
      }
    };
    const [clients, programs, appointments, meal_logs, assessments] = await Promise.all([
      countTable('clients'),
      countTable('program_templates'),
      countTable('appointments'),
      countTable('meal_logs'),
      countTable('assessments'),
    ]);

    // The same subqueries the workspaces list uses, so the two screens can
    // never disagree about how active a practice is.
    const [act] = await this.prisma.$queryRawUnsafe<Array<{
      meals_7d: bigint; messages_7d: bigint; clients_active_7d: bigint;
      ai_calls_30d: bigint; last_active: Date | null;
    }>>(
      `SELECT
         (SELECT COUNT(*) FROM public.meal_logs m
           WHERE m.workspace_id = $1::uuid AND m.logged_at > now() - interval '7 days') AS meals_7d,
         (SELECT COUNT(*) FROM public.messages ms
           WHERE ms.workspace_id = $1::uuid AND ms.created_at > now() - interval '7 days') AS messages_7d,
         (SELECT COUNT(*) FROM public.clients c
           WHERE c.workspace_id = $1::uuid AND c.last_active_at > now() - interval '7 days') AS clients_active_7d,
         (SELECT COUNT(*) FROM public.ai_usage_events a
           WHERE a.workspace_id = $1::uuid AND a.created_at > now() - interval '30 days'
             AND a.status <> 'error') AS ai_calls_30d,
         (SELECT MAX(c.last_active_at) FROM public.clients c
           WHERE c.workspace_id = $1::uuid) AS last_active`,
      id,
    ).catch(() => [undefined as never]);

    const [bill] = await this.prisma.$queryRawUnsafe<Array<{
      setup_fee_inr: bigint | null; setup_plan: string | null; setup_paid_at: Date | null;
      lifetime_paid_inr: bigint | null; payment_count: bigint; failed_30d: bigint;
      subscription_status: string | null; current_period_end: Date | null; manual_renewal: boolean | null;
    }>>(
      `SELECT
         (SELECT SUM(amount_inr) FROM public.workspace_setup_fee_payments
           WHERE workspace_id = $1::uuid) AS setup_fee_inr,
         (SELECT plan_key FROM public.workspace_setup_fee_payments
           WHERE workspace_id = $1::uuid ORDER BY paid_at DESC LIMIT 1) AS setup_plan,
         (SELECT MAX(paid_at) FROM public.workspace_setup_fee_payments
           WHERE workspace_id = $1::uuid) AS setup_paid_at,
         -- ::bigint before dividing: SUM() is numeric, so plain / 100 returns
         -- 0.00000000000000000000 rather than an integer rupee figure.
         (SELECT (COALESCE(SUM(amount_paise), 0) / 100)::bigint FROM public.payments
           WHERE workspace_id = $1::uuid AND status = 'captured') AS lifetime_paid_inr,
         (SELECT COUNT(*) FROM public.payments
           WHERE workspace_id = $1::uuid AND status = 'captured') AS payment_count,
         (SELECT COUNT(*) FROM public.payments
           WHERE workspace_id = $1::uuid AND status = 'failed'
             AND created_at > now() - interval '30 days') AS failed_30d,
         s.status AS subscription_status, s.current_period_end,
         COALESCE((s.metadata->>'manual_renewal')::boolean, false) AS manual_renewal
       FROM (SELECT 1) _
       LEFT JOIN public.subscriptions s
         ON s.workspace_id = $1::uuid
        AND s.status IN ('active','authenticated','pending','halted')
       LIMIT 1`,
      id,
    ).catch(() => [undefined as never]);

    const events = await this.prisma.$queryRawUnsafe<Array<{
      action: string; actor_email: string | null; created_at: Date;
    }>>(
      `SELECT action, actor_email, created_at
         FROM public.admin_audit_log
        WHERE resource_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT 12`,
      id,
    ).catch(() => []);

    const clients_list = await this.prisma.$queryRawUnsafe<Array<{
      id: string; name: string | null; last_log_at: Date | null; meals_7d: bigint;
    }>>(
      `SELECT c.id, COALESCE(NULLIF(c.name,''), c.display_name) AS name,
              c.last_active_at AS last_log_at,
              (SELECT COUNT(*) FROM public.meal_logs m
                WHERE m.client_id = c.id AND m.logged_at > now() - interval '7 days') AS meals_7d
         FROM public.clients c
        WHERE c.workspace_id = $1::uuid AND c.status = 'active'
        ORDER BY c.last_active_at DESC NULLS LAST
        LIMIT 50`,
      id,
    ).catch(() => []);

    const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

    return {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      plan: ws.plan,
      status: ws.status as 'active' | 'suspended' | 'deleted',
      trial_ends_at: ws.trial_ends_at,
      created_at: ws.created_at,
      owner_id: ws.owner_id,
      owner_email,
      member_count: memberRows.filter((m) => m.status === 'active').length,
      contact_email: ws.contact_email,
      contact_phone: ws.contact_phone,
      city: ws.city,
      country_code: ws.country_code,
      gstin: ws.gstin,
      pan: ws.pan,
      members: memberRows,
      owner_name: ownerRows[0]?.full_name ?? null,
      activity: {
        meals_7d: n(act?.meals_7d),
        messages_7d: n(act?.messages_7d),
        clients_active_7d: n(act?.clients_active_7d),
        ai_calls_30d: n(act?.ai_calls_30d),
        ai_limit: null,
        last_active: act?.last_active ?? null,
      },
      billing: {
        setup_fee_inr: n(bill?.setup_fee_inr),
        setup_plan: bill?.setup_plan ?? null,
        setup_paid_at: bill?.setup_paid_at ?? null,
        lifetime_paid_inr: n(bill?.lifetime_paid_inr),
        payment_count: n(bill?.payment_count),
        failed_30d: n(bill?.failed_30d),
        subscription_status: bill?.subscription_status ?? null,
        current_period_end: bill?.current_period_end ?? null,
        manual_renewal: !!bill?.manual_renewal,
      },
      events,
      clients_list: clients_list.map((c) => ({ ...c, meals_7d: n(c.meals_7d) })),
      counts: {
        members: memberRows.filter((m) => m.status === 'active').length,
        clients,
        programs,
        appointments,
        meal_logs,
        assessments,
      },
    };
  }

  /**
   * Suspend / activate / delete change who can use the practice: the
   * WorkspaceStatusGuard locks everyone in a suspended or deleted workspace
   * (staff and clients). Each change drops the cached identity of every member
   * and client so it applies on their very next request, not after the cache TTL.
   */
  async suspend(id: string): Promise<{ id: string; status: 'suspended' }> {
    await this.requireExists(id);
    await this.prisma.workspaces.update({ where: { id }, data: { status: 'suspended' } });
    await this.dropCachedIdentities(id);
    return { id, status: 'suspended' };
  }

  async activate(id: string): Promise<{ id: string; status: 'active' }> {
    await this.requireExists(id);
    await this.prisma.workspaces.update({ where: { id }, data: { status: 'active' } });
    await this.dropCachedIdentities(id);
    return { id, status: 'active' };
  }

  /**
   * Soft delete — sets status='deleted' (data is kept; hard delete is a separate
   * concern). Refused while a Razorpay subscription is still live, so a closed
   * practice is never charged again: cancel the subscription first.
   */
  async softDelete(id: string): Promise<{ id: string; status: 'deleted' }> {
    await this.requireExists(id);
    const [live] = await this.prisma.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM public.subscriptions
        WHERE workspace_id = $1::uuid AND status IN ('active', 'authenticated', 'pending', 'halted')`,
      id,
    );
    if (live?.n) {
      throw new ConflictException(
        'This practice still has a live Razorpay subscription. Cancel it first so they are not charged again, then delete.',
      );
    }
    await this.prisma.workspaces.update({ where: { id }, data: { status: 'deleted' } });
    await this.dropCachedIdentities(id);
    return { id, status: 'deleted' };
  }

  /** Forget the cached AuthUser of everyone tied to a workspace (members and clients). */
  private async dropCachedIdentities(workspaceId: string): Promise<void> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
      `SELECT user_id::text AS user_id FROM public.workspace_members WHERE workspace_id = $1::uuid AND user_id IS NOT NULL
       UNION
       SELECT user_id::text FROM public.clients WHERE workspace_id = $1::uuid AND user_id IS NOT NULL`,
      workspaceId,
    );
    await Promise.all(rows.map((r) => this.authCache.invalidate(r.user_id)));
  }

  private async requireExists(id: string): Promise<void> {
    const exists = await this.prisma.workspaces.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Workspace ${id} not found.`);
  }
}
