import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BILLING_GRACE_DAYS, limitsForPlan, type PlanLimits } from '../billing/plans';

/**
 * What a workspace is currently consuming against each quota.
 */
export interface WorkspaceUsage {
  clients: number;
  team: number;
  aiCallsThisMonth: number;
  storageBytes: number;
}

export interface LimitsSnapshot {
  plan: string;
  limits: PlanLimits;
  usage: WorkspaceUsage;
  /** limit - usage per quota; null where the limit is unlimited. */
  remaining: {
    clients: number | null;
    team: number | null;
    aiCallsThisMonth: number | null;
    storageBytes: number | null;
  };
}

export type LimitResource = 'clients' | 'team' | 'ai_calls' | 'storage';

/**
 * Thrown when an operation would exceed the workspace's plan quota. Surfaces as
 * HTTP 402 Payment Required with a structured body the frontend can act on
 * (show an upgrade CTA naming the exact resource + numbers).
 */
export class PlanLimitException extends HttpException {
  constructor(resource: LimitResource, limit: number, used: number, plan: string) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'Plan limit reached',
        code: 'plan_limit_exceeded',
        resource,
        limit,
        used,
        plan,
        message: messageFor(resource, limit, plan),
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

function messageFor(resource: LimitResource, limit: number, plan: string): string {
  const noun = {
    clients: 'client',
    team: 'team member',
    ai_calls: 'AI call',
    storage: 'storage',
  }[resource];
  if (resource === 'ai_calls') {
    return `You've used your ${limit.toLocaleString()} monthly AI calls on the ${plan} plan. Upgrade or add a top-up to continue.`;
  }
  return `Your ${plan} plan allows ${limit} ${noun}${limit === 1 ? '' : 's'}. Upgrade your plan to add more.`;
}

/**
 * LimitsService — the single place that knows a workspace's plan quotas and
 * how much of each it has consumed (Module 2 — Subscription Management +
 * Usage Monitoring). Other services call the assert* methods BEFORE a
 * quota-consuming operation; the read methods power the usage panel.
 */
@Injectable()
export class LimitsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Effective plan key — an active subscription wins over workspaces.plan.
   *
   * A subscription whose renewal charge has failed (status halted/pending) keeps
   * its plan during a grace window (BILLING_GRACE_DAYS past current_period_end),
   * then stops counting — at which point limits fall back to workspaces.plan
   * (typically 'trial'). This is the enforcement half of dunning: pay within
   * grace and nothing changes; let it lapse and the workspace is restricted.
   */
  async resolvePlan(workspaceId: string): Promise<string> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ plan: string | null; sub_plan: string | null }>>(
      `SELECT w.plan,
              (SELECT s.plan_key FROM public.subscriptions s
                WHERE s.workspace_id = w.id
                  AND (
                    s.status IN ('active', 'authenticated', 'trialing', 'created')
                    OR (
                      s.status IN ('halted', 'pending')
                      AND s.current_period_end IS NOT NULL
                      AND s.current_period_end > now() - ($2 || ' days')::interval
                    )
                  )
                ORDER BY s.created_at DESC LIMIT 1) AS sub_plan
         FROM public.workspaces w
        WHERE w.id = $1::uuid
        LIMIT 1`,
      workspaceId,
      String(BILLING_GRACE_DAYS),
    );
    return row?.sub_plan ?? row?.plan ?? 'trial';
  }

  async getLimits(workspaceId: string): Promise<PlanLimits> {
    return limitsForPlan(await this.resolvePlan(workspaceId));
  }

  /** Current consumption across all quotas. */
  async getUsage(workspaceId: string): Promise<WorkspaceUsage> {
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{ clients: bigint; team: bigint; ai_calls: bigint }>
    >(
      `SELECT
         ((SELECT count(*) FROM public.clients
             WHERE workspace_id = $1::uuid AND status::text = 'active')
          + (SELECT count(*) FROM public.client_invites
               WHERE workspace_id = $1::uuid AND status = 'pending'))            AS clients,
         ((SELECT count(*) FROM public.workspace_members
             WHERE workspace_id = $1::uuid AND status = 'active')
          + (SELECT count(*) FROM public.workspace_invites
               WHERE workspace_id = $1::uuid AND status = 'pending'))            AS team,
         (SELECT count(*) FROM public.ai_usage_events
            WHERE workspace_id = $1::uuid
              AND created_at >= date_trunc('month', now()))                      AS ai_calls`,
      workspaceId,
    );
    return {
      clients: Number(row?.clients ?? 0n),
      team: Number(row?.team ?? 0n),
      aiCallsThisMonth: Number(row?.ai_calls ?? 0n),
      storageBytes: 0, // not yet tracked per-upload; reserved for future
    };
  }

  async snapshot(workspaceId: string): Promise<LimitsSnapshot> {
    const plan = await this.resolvePlan(workspaceId);
    const limits = limitsForPlan(plan);
    const usage = await this.getUsage(workspaceId);
    return {
      plan,
      limits,
      usage,
      remaining: {
        clients: remaining(limits.maxClients, usage.clients),
        team: remaining(limits.maxTeam, usage.team),
        aiCallsThisMonth: remaining(limits.aiCallsPerMonth, usage.aiCallsThisMonth),
        storageBytes: remaining(limits.maxStorageBytes, usage.storageBytes),
      },
    };
  }

  // ── Enforcement ────────────────────────────────────────────────────

  /** Throw if adding one more client (or client invite) would exceed the cap. */
  async assertCanAddClient(workspaceId: string): Promise<void> {
    const plan = await this.resolvePlan(workspaceId);
    const limit = limitsForPlan(plan).maxClients;
    if (limit == null) return;
    const used = (await this.getUsage(workspaceId)).clients;
    if (used >= limit) throw new PlanLimitException('clients', limit, used, plan);
  }

  /** Throw if adding one more team member (or staff invite) would exceed the cap. */
  async assertCanAddTeamMember(workspaceId: string): Promise<void> {
    const plan = await this.resolvePlan(workspaceId);
    const limit = limitsForPlan(plan).maxTeam;
    if (limit == null) return;
    const used = (await this.getUsage(workspaceId)).team;
    if (used >= limit) throw new PlanLimitException('team', limit, used, plan);
  }

  /**
   * Throw if the workspace has spent its monthly AI-call budget. Called by AI
   * services before invoking a provider. Fails OPEN (allows the call) if the
   * workspace can't be resolved, so a lookup hiccup never blocks paid usage.
   */
  async assertAiQuota(workspaceId: string | null | undefined): Promise<void> {
    if (!workspaceId) return;
    let plan: string;
    let limit: number | null;
    try {
      plan = await this.resolvePlan(workspaceId);
      limit = limitsForPlan(plan).aiCallsPerMonth;
    } catch {
      return; // fail open
    }
    if (limit == null) return;
    const used = (await this.getUsage(workspaceId)).aiCallsThisMonth;
    if (used >= limit) throw new PlanLimitException('ai_calls', limit, used, plan);
  }
}

function remaining(limit: number | null, used: number): number | null {
  if (limit == null) return null;
  return Math.max(0, limit - used);
}
