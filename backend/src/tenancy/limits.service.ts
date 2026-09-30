import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { limitsForPlan, type PlanLimits } from '../billing/plans';
import { resolveOrganizationPlans, resolveWorkspacePlan } from '../billing/resolve-plan';
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
  if (resource === 'storage') {
    return `Your practice has used its ${formatBytes(limit)} of storage on the ${plan} plan. Delete files you no longer need, or upgrade for more space.`;
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
  private readonly logger = new Logger(LimitsService.name);

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

  /** Effective plan of every workspace in an organization (see resolveOrganizationPlans). */
  async resolveOrganizationPlans(organizationId: string): Promise<string[]> {
    return resolveOrganizationPlans(this.prisma, organizationId);
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
      grantedCreditsThisCycle(this.prisma, workspaceId, base.aiCallsPerMonth),
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
         -- Failed calls gave the customer nothing, so they don't use a credit.
         (SELECT count(*) FROM public.ai_usage_events
            WHERE workspace_id = $1::uuid AND status <> 'error'
              AND created_at >= date_trunc('month', now()))                      AS ai_calls`,
      workspaceId,
    );
    return {
      clients: Number(row?.clients ?? 0n),
      team: Number(row?.team ?? 0n),
      aiCallsThisMonth: Number(row?.ai_calls ?? 0n),
      // Computed on demand via storageUsageBytes() (a SUM over public.files) —
      // kept OUT of getUsage so the hot assert paths (client/AI checks) don't
      // pay for it. snapshot() fills it in for display.
      storageBytes: 0,
    };
  }

  /**
   * Everything the practice has stored, across every bucket, per bucket.
   *
   * Measured from storage itself (storage.objects), so it counts whatever was
   * uploaded however it was uploaded. A file belongs to the practice when its
   * top folder is the practice's id, one of its clients' ids, a client's or a
   * staff member's user id, or it sits under verification/<practice id>/:
   * those are the folder schemes every upload path in NUSI uses.
   */
  async storageBreakdown(workspaceId: string): Promise<StorageBucketUsage[]> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ bucket: string; bytes: bigint; files: bigint }>>(
        `WITH owners AS (
           SELECT $1::text AS id
           UNION SELECT id::text FROM public.clients WHERE workspace_id = $1::uuid
           UNION SELECT user_id::text FROM public.clients WHERE workspace_id = $1::uuid AND user_id IS NOT NULL
           UNION SELECT user_id::text FROM public.workspace_members WHERE workspace_id = $1::uuid AND user_id IS NOT NULL
         )
         SELECT o.bucket_id AS bucket,
                COALESCE(SUM((o.metadata->>'size')::bigint), 0)::bigint AS bytes,
                COUNT(*)::bigint AS files
           FROM storage.objects o
          WHERE split_part(o.name, '/', 1) IN (SELECT id FROM owners)
             OR (split_part(o.name, '/', 1) = 'verification' AND split_part(o.name, '/', 2) = $1::text)
          GROUP BY o.bucket_id
          ORDER BY 2 DESC`,
        workspaceId,
      );
      return rows.map((r) => ({
        bucket: r.bucket,
        label: BUCKET_LABELS[r.bucket] ?? 'Other files',
        bytes: Number(r.bytes),
        files: Number(r.files),
      }));
    } catch (err) {
      // Storage schema unreadable (shouldn't happen): fall back to the file
      // vault's own record so the gate still works.
      this.logger.warn(`Storage usage from storage.objects failed, using file vault: ${(err as Error).message}`);
      const [row] = await this.prisma.$queryRawUnsafe<Array<{ bytes: bigint; files: bigint }>>(
        `SELECT COALESCE(SUM(f.file_size), 0)::bigint AS bytes, COUNT(*)::bigint AS files
           FROM public.files f
           JOIN public.clients c ON c.id = f.client_id
          WHERE c.workspace_id = $1::uuid`,
        workspaceId,
      );
      return [{ bucket: 'client-files', label: BUCKET_LABELS['client-files'], bytes: Number(row?.bytes ?? 0n), files: Number(row?.files ?? 0n) }];
    }
  }

  /** Total bytes the practice has stored (see storageBreakdown). */
  async storageUsageBytes(workspaceId: string): Promise<number> {
    return (await this.storageBreakdown(workspaceId)).reduce((n, b) => n + b.bytes, 0);
  }

  /** Used vs the plan's allowance, with the per-bucket breakdown, for the UI. */
  async storageSummary(workspaceId: string): Promise<StorageSummary> {
    const plan = await this.resolvePlan(workspaceId);
    const limit = (await this.effectiveLimits(workspaceId, plan)).maxStorageBytes;
    const breakdown = await this.storageBreakdown(workspaceId);
    const used = breakdown.reduce((n, b) => n + b.bytes, 0);
    return { plan, used, limit, breakdown };
  }

  async snapshot(workspaceId: string): Promise<LimitsSnapshot> {
    const plan = await this.resolvePlan(workspaceId);
    // Effective (plan + purchased credits) so the UI shows what the gate enforces.
    const limits = await this.effectiveLimits(workspaceId, plan);
    const usage = await this.getUsage(workspaceId);
    usage.storageBytes = await this.storageUsageBytes(workspaceId);
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

  /**
   * Throw if storing `incomingBytes` more would exceed the plan's storage cap.
   * Called when RECORDING a file (bytes are already in the bucket via a signed
   * direct upload), so the caller deletes the orphaned object on rejection.
   * Unlimited plans and non-positive sizes pass through.
   */
  /**
   * Throw before an upload starts when the practice has no storage left. The
   * size isn't known yet at that point, so this only blocks a full practice;
   * assertStorageQuota re-checks with the real size once the file is recorded.
   */
  async assertStorageAvailable(workspaceId: string): Promise<void> {
    const plan = await this.resolvePlan(workspaceId);
    const limit = (await this.effectiveLimits(workspaceId, plan)).maxStorageBytes;
    if (limit == null) return;
    const used = await this.storageUsageBytes(workspaceId);
    if (used >= limit) throw new PlanLimitException('storage', limit, used, plan);
  }

  async assertStorageQuota(workspaceId: string, incomingBytes: number): Promise<void> {
    const add = Math.max(0, Math.floor(incomingBytes || 0));
    if (add === 0) return;
    const plan = await this.resolvePlan(workspaceId);
    const limit = (await this.effectiveLimits(workspaceId, plan)).maxStorageBytes;
    if (limit == null) return; // unlimited
    const used = await this.storageUsageBytes(workspaceId);
    if (used + add > limit) throw new PlanLimitException('storage', limit, used, plan);
  }
}

/** What each bucket holds, in the words a practice owner would use. */
const BUCKET_LABELS: Record<string, string> = {
  'client-files': 'Client files & documents',
  'progress-photos': 'Progress photos',
  'meal-photos': 'Meal photos',
  'product-images': 'Shop product images',
  'message-attachments': 'Message attachments',
  'assessment-files': 'Assessment files',
  'health-assessments': 'Health assessments',
  'weekly-plan-pdfs': 'Plan PDFs',
  'action-plan-images': 'Action plan images',
  'demo-meals': 'Sample meal photos',
};

export interface StorageBucketUsage {
  bucket: string;
  label: string;
  bytes: number;
  files: number;
}

export interface StorageSummary {
  plan: string;
  used: number;
  /** null = unlimited. */
  limit: number | null;
  breakdown: StorageBucketUsage[];
}

/** 5368709120 -> "5 GB", 1536 -> "1.5 KB". */
export function formatBytes(n: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  const s = i === 0 ? String(v) : (Math.round(v * 10) / 10).toString();
  return `${s} ${units[i]}`;
}

function remaining(limit: number | null, used: number): number | null {
  if (limit == null) return null;
  return Math.max(0, limit - used);
}
