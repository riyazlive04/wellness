import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { limitsForPlan, type PlanLimits } from '../billing/plans';
import { resolveWorkspacePlan } from '../billing/resolve-plan';
import { grantedCreditsThisCycle } from '../billing/credit-grants';
import { activeAddons } from '../billing/workspace-addons';
import { addonGrants } from '../billing/addons';

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

export type LimitResource = 'clients' | 'team' | 'managers' | 'ai_calls' | 'storage';

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
    managers: 'manager',
    ai_calls: 'AI credit',
    storage: 'storage',
  }[resource];
  if (resource === 'ai_calls') {
    // 1 credit = 1 AI call. "Credits" is the customer-facing term on the
    // pricing sheet, so the limit message must speak that language.
    return `You've used all ${limit.toLocaleString()} AI credits on the ${plan} plan this month. Upgrade or buy a credit pack to continue.`;
  }
  if (resource === 'managers' && limit === 0) {
    return `The ${plan} plan doesn't include the manager role. Upgrade to Pro or Elite to add managers.`;
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
    return resolveWorkspacePlan(this.prisma, workspaceId);
  }

  async getLimits(workspaceId: string): Promise<PlanLimits> {
    const plan = await this.resolvePlan(workspaceId);
    return this.effectiveLimits(workspaceId, plan);
  }

  /**
   * Plan quotas PLUS anything the workspace bought on top. Every path that
   * gates or displays AI usage must resolve limits through here — otherwise
   * purchased credits would show in the UI but still be refused at the gate
   * (or the reverse), and the customer would have paid for nothing.
   */
  private async effectiveLimits(workspaceId: string, plan: string): Promise<PlanLimits> {
    const base = limitsForPlan(plan);
    const [credits, addons] = await Promise.all([
      grantedCreditsThisCycle(this.prisma, workspaceId),
      activeAddons(this.prisma, workspaceId),
    ]);
    const { extraClients, extraTeam } = addonGrants(addons);

    // `null` means unlimited — adding to it is meaningless, so leave it alone.
    return {
      ...base,
      maxClients: base.maxClients == null ? null : base.maxClients + extraClients,
      maxTeam: base.maxTeam == null ? null : base.maxTeam + extraTeam,
      aiCallsPerMonth: base.aiCallsPerMonth == null ? null : base.aiCallsPerMonth + credits,
    };
  }

  /** Current consumption across all quotas. */
  async getUsage(workspaceId: string): Promise<WorkspaceUsage> {
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{ clients: bigint; team: bigint; ai_calls: bigint }>
    >(
      `SELECT
         -- Active clients only. Join requests deliberately do NOT count: anyone
         -- holding the join link can queue up, and a stranger's unapproved
         -- request must never consume a paid seat. The seat is taken at the
         -- moment the owner approves (see approveJoinRequest).
         (SELECT count(*) FROM public.clients
            WHERE workspace_id = $1::uuid AND status::text = 'active')           AS clients,
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
    // Effective (plan + purchased credits) so the UI shows what the gate enforces.
    const limits = await this.effectiveLimits(workspaceId, plan);
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

  /**
   * Throw if adding one more client (or client invite) would exceed the cap.
   * Resolves EFFECTIVE limits so a purchased "Extra 100 clients" add-on
   * actually raises the ceiling — otherwise the customer pays ₹999/mo and is
   * still blocked at the same number.
   */
  async assertCanAddClient(workspaceId: string): Promise<void> {
    const plan = await this.resolvePlan(workspaceId);
    const limit = (await this.effectiveLimits(workspaceId, plan)).maxClients;
    if (limit == null) return;
    const used = (await this.getUsage(workspaceId)).clients;
    if (used >= limit) throw new PlanLimitException('clients', limit, used, plan);
  }

  /**
   * Throw if adding one more team member (or staff invite) would exceed the cap.
   * Effective limits, so purchased "Extra team member" seats count.
   */
  async assertCanAddTeamMember(workspaceId: string): Promise<void> {
    const plan = await this.resolvePlan(workspaceId);
    const limit = (await this.effectiveLimits(workspaceId, plan)).maxTeam;
    if (limit == null) return;
    const used = (await this.getUsage(workspaceId)).team;
    if (used >= limit) throw new PlanLimitException('team', limit, used, plan);
  }

  /**
   * Throw if granting one more `manager` role would exceed the plan's manager
   * sub-cap. Counts active managers + pending manager invites. A cap of 0 (Basic)
   * means the plan can't have managers at all. Called from the invite / role-change
   * paths BEFORE the write, in addition to the overall team-size check.
   */
  async assertCanAddManager(workspaceId: string): Promise<void> {
    const plan = await this.resolvePlan(workspaceId);
    const limit = limitsForPlan(plan).maxManagers;
    if (limit == null) return; // unlimited
    const used = await this.countManagers(workspaceId);
    if (used >= limit) throw new PlanLimitException('managers', limit, used, plan);
  }

  /** Active members holding the manager role + outstanding pending manager invites. */
  private async countManagers(workspaceId: string): Promise<number> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ managers: bigint }>>(
      `SELECT
         ((SELECT count(*) FROM public.workspace_members
             WHERE workspace_id = $1::uuid AND status = 'active' AND role = 'manager')
          + (SELECT count(*) FROM public.workspace_invites
               WHERE workspace_id = $1::uuid AND status = 'pending' AND role = 'manager')) AS managers`,
      workspaceId,
    );
    return Number(row?.managers ?? 0n);
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
      // Effective, so credits the customer PAID for actually let calls through.
      limit = (await this.effectiveLimits(workspaceId, plan)).aiCallsPerMonth;
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
