import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PushService } from '../clients/push.service';
import type { AuthUser } from '../auth/types/auth-user.type';

/**
 * EnterpriseAiService — Module 12 AI Ecosystem layer that ties the AI modules
 * together with three capabilities they lacked:
 *   1. A persisted AI recommendation store (the Decision/Recommendation Engine).
 *   2. A GOVERNANCE queue: AI-proposed high-impact actions require human
 *      approval before they execute.
 *   3. AI feedback (the learning signal).
 * Plus a unified AI-ecosystem analytics roll-up.
 */
@Injectable()
export class EnterpriseAiService {
  private readonly logger = new Logger(EnterpriseAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  private ws(user: AuthUser): string {
    if (!user.workspaceId) throw new ForbiddenException('Not in a workspace.');
    return user.workspaceId;
  }

  // ── Recommendations ─────────────────────────────────────────────────
  async listRecommendations(user: AuthUser): Promise<RecRow[]> {
    return this.prisma.$queryRawUnsafe<RecRow[]>(
      `SELECT * FROM public.ai_recommendations WHERE workspace_id = $1::uuid
        ORDER BY (status='new') DESC, created_at DESC LIMIT 100`,
      this.ws(user));
  }

  /** Generate fresh AI recommendations from the workspace's data + persist them. */
  async generateRecommendations(user: AuthUser): Promise<RecRow[]> {
    const wsid = this.ws(user);
    const ctx = await this.clinicalContext(wsid);

    // Deterministic, rule-based recommendations — no AI or API key required.
    const recs = this.ruleBasedRecs(ctx);
    for (const r of recs) {
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO public.ai_recommendations (workspace_id, scope, type, title, body, severity, source, status)
         VALUES ($1::uuid, 'clinical', $2, $3, $4, $5, 'rules', 'new')`,
        wsid, r.type, r.title.slice(0, 200), r.body.slice(0, 2000), r.severity);
    }

    // If there are at-risk clients, propose a GOVERNED broadcast (needs approval).
    if (ctx.at_risk > 0) {
      await this.proposeGovernance(wsid, {
        assistant_type: 'clinical',
        action_type: 'broadcast_message',
        title: `Re-engage ${ctx.at_risk} at-risk client(s)`,
        description: 'Send a gentle check-in message to active clients who haven’t logged a meal in 7 days.',
        params: { segment: 'at_risk', content: 'Hi! We noticed it’s been a few days — how are you doing? Log your next meal whenever you can, we’re here to help 🌿' },
      });
    }
    return this.listRecommendations(user);
  }

  /**
   * Deterministic recommendation engine — turns the workspace's clinical
   * context into 3-5 prioritised recommendations with no AI call. Rules cover
   * engagement (at-risk), clinical (program progress), operations (no programs),
   * and growth (pipeline / small base).
   */
  private ruleBasedRecs(ctx: ClinicalContext): Array<{ type: string; title: string; body: string; severity: string }> {
    const recs: Array<{ type: string; title: string; body: string; severity: string }> = [];
    const plural = (n: number) => (n === 1 ? '' : 's');

    if (ctx.at_risk > 0) {
      recs.push({
        type: 'engagement',
        title: `Re-engage ${ctx.at_risk} quiet client${plural(ctx.at_risk)}`,
        body: `${ctx.at_risk} active client${plural(ctx.at_risk)} ${ctx.at_risk === 1 ? "hasn't" : "haven't"} logged a meal in 7 days. A quick, warm check-in is the highest-leverage thing you can do to protect retention.`,
        severity: 'risk',
      });
    }

    if (ctx.active_clients > 0 && ctx.active_programs === 0) {
      recs.push({
        type: 'operations',
        title: 'Assign structured programs',
        body: 'You have active clients but no active programs. Assigning a program gives each client clear guidance, milestones, and a reason to stay engaged.',
        severity: 'risk',
      });
    } else if (ctx.active_programs > 0 && ctx.avg_progress > 0 && ctx.avg_progress < 60) {
      recs.push({
        type: 'clinical',
        title: 'Review low-progress programs',
        body: `Average program progress is ${ctx.avg_progress}% — below the 60% healthy mark. A small plan tweak or a motivating message can get clients moving again.`,
        severity: 'opportunity',
      });
    }

    if (ctx.new_clients_30d === 0) {
      recs.push({
        type: 'growth',
        title: 'Restart the client pipeline',
        body: 'No new clients joined in the last 30 days. A referral ask to happy clients or a short campaign keeps growth from stalling.',
        severity: ctx.active_clients <= 2 ? 'risk' : 'opportunity',
      });
    } else {
      recs.push({
        type: 'growth',
        title: `Onboard your ${ctx.new_clients_30d} recent joiner${plural(ctx.new_clients_30d)}`,
        body: `${ctx.new_clients_30d} client${plural(ctx.new_clients_30d)} joined in the last 30 days. Get them into a program and set first-week goals to lock in engagement early.`,
        severity: 'opportunity',
      });
    }

    if (ctx.active_clients > 0 && ctx.active_clients <= 2) {
      recs.push({
        type: 'growth',
        title: 'Reduce single-client dependency',
        body: `With only ${ctx.active_clients} active client${plural(ctx.active_clients)}, the practice is vulnerable to churn. Prioritise lead generation to build a more resilient base.`,
        severity: 'risk',
      });
    }

    if (recs.length === 0) {
      recs.push({
        type: 'operations',
        title: 'Keep the momentum',
        body: 'Engagement, programs, and growth all look healthy. Maintain regular check-ins and keep onboarding to sustain it.',
        severity: 'info',
      });
    }

    return recs.slice(0, 5);
  }

  async setRecommendationStatus(user: AuthUser, id: string, status: 'applied' | 'dismissed' | 'new'): Promise<RecRow> {
    const [row] = await this.prisma.$queryRawUnsafe<RecRow[]>(
      `UPDATE public.ai_recommendations SET status = $3, updated_at = now()
        WHERE id = $1::uuid AND workspace_id = $2::uuid RETURNING *`,
      id, this.ws(user), status);
    if (!row) throw new NotFoundException('Recommendation not found.');
    return row;
  }

  // ── Governance ──────────────────────────────────────────────────────
  async listGovernance(user: AuthUser, status?: string): Promise<GovRow[]> {
    return this.prisma.$queryRawUnsafe<GovRow[]>(
      `SELECT * FROM public.ai_governance_actions WHERE workspace_id = $1::uuid
         AND ($2::text IS NULL OR status = $2)
        ORDER BY (status='pending') DESC, created_at DESC LIMIT 100`,
      this.ws(user), status ?? null);
  }

  private async proposeGovernance(workspaceId: string, a: {
    assistant_type?: string; action_type: string; title: string; description?: string; params: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.ai_governance_actions (workspace_id, assistant_type, proposed_by, action_type, title, description, params)
       VALUES ($1::uuid, $2, 'ai', $3, $4, $5, $6::jsonb)`,
      workspaceId, a.assistant_type ?? null, a.action_type, a.title, a.description ?? null, JSON.stringify(a.params));
  }

  /** Approve (and execute) or reject an AI-proposed action. */
  async reviewGovernance(user: AuthUser, id: string, decision: 'approve' | 'reject', note?: string): Promise<GovRow> {
    const wsid = this.ws(user);
    const [action] = await this.prisma.$queryRawUnsafe<GovRow[]>(
      `SELECT * FROM public.ai_governance_actions WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`, id, wsid);
    if (!action) throw new NotFoundException('Action not found.');
    if (action.status !== 'pending') throw new BadRequestException('Action already reviewed.');

    if (decision === 'reject') {
      return this.finishGovernance(id, 'rejected', user.id, note, null);
    }

    // Approve → execute by type (only known, safe actions actually run).
    let result: unknown = null;
    let status = 'approved';
    try {
      if (action.action_type === 'broadcast_message') {
        const sent = await this.executeBroadcast(wsid, user.id, action.params as Record<string, unknown>);
        result = { sent };
        status = 'executed';
      }
    } catch (err) {
      this.logger.warn(`Governance execution failed: ${(err as Error).message}`);
      return this.finishGovernance(id, 'failed', user.id, (err as Error).message, null);
    }
    return this.finishGovernance(id, status, user.id, note, result);
  }

  private async finishGovernance(id: string, status: string, reviewerId: string, note: string | undefined, result: unknown): Promise<GovRow> {
    const [row] = await this.prisma.$queryRawUnsafe<GovRow[]>(
      `UPDATE public.ai_governance_actions
          SET status=$2, reviewed_by=$3::uuid, reviewed_at=now(), review_note=$4, result=$5::jsonb
        WHERE id=$1::uuid RETURNING *`,
      id, status, reviewerId, note ?? null, result == null ? null : JSON.stringify(result));
    return row;
  }

  /** Send a check-in message (+ push) to a target segment of clients. */
  private async executeBroadcast(workspaceId: string, _reviewerId: string, params: Record<string, unknown>): Promise<number> {
    const content = typeof params.content === 'string' ? params.content : 'Checking in — how are you doing?';
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT c.id FROM public.clients c
        WHERE c.workspace_id = $1::uuid AND c.status::text = 'active'
          AND NOT EXISTS (SELECT 1 FROM public.meal_logs m WHERE m.client_id = c.id AND m.logged_at >= now()-interval '7 days')
        LIMIT 100`, workspaceId);
    let sent = 0;
    for (const c of rows) {
      try {
        await this.prisma.messages.create({
          data: { client_id: c.id, workspace_id: workspaceId, sender_id: null, sender_type: 'admin', message_type: 'manual', content, is_read: false },
        });
        void this.push.sendToClient(c.id, { title: 'A note from your nutritionist', body: content.slice(0, 120), url: '/portal/chat' }).catch(() => 0);
        sent++;
      } catch { /* skip individual failures */ }
    }
    return sent;
  }

  // ── Feedback (learning signal) ──────────────────────────────────────
  async recordFeedback(user: AuthUser, input: { subjectType: string; subjectId?: string; rating: 'up' | 'down'; note?: string }): Promise<{ ok: true }> {
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO public.ai_feedback (workspace_id, user_id, subject_type, subject_id, rating, note)
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6)
       ON CONFLICT (user_id, subject_type, subject_id) WHERE subject_id IS NOT NULL
       DO UPDATE SET rating = EXCLUDED.rating, note = EXCLUDED.note, created_at = now()`,
      user.workspaceId, user.id, input.subjectType, input.subjectId ?? null, input.rating, input.note ?? null);
    return { ok: true };
  }

  // ── Unified AI analytics ────────────────────────────────────────────
  async analytics(user: AuthUser): Promise<Record<string, number>> {
    const wsid = this.ws(user);
    const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint | null>>>(
      `SELECT
         (SELECT count(*) FROM public.ai_usage_events WHERE workspace_id=$1::uuid AND created_at >= now()-interval '30 days') AS ai_calls_30d,
         (SELECT count(*) FROM public.ai_usage_events WHERE workspace_id=$1::uuid AND status='error' AND created_at >= now()-interval '30 days') AS ai_errors_30d,
         (SELECT count(*) FROM public.assistant_conversations WHERE workspace_id=$1::uuid) AS conversations,
         (SELECT count(*) FROM public.assistant_actions WHERE workspace_id=$1::uuid AND status='executed') AS actions_run,
         (SELECT count(*) FROM public.ai_recommendations WHERE workspace_id=$1::uuid AND status='new') AS recs_new,
         (SELECT count(*) FROM public.ai_recommendations WHERE workspace_id=$1::uuid AND status='applied') AS recs_applied,
         (SELECT count(*) FROM public.ai_governance_actions WHERE workspace_id=$1::uuid AND status='pending') AS gov_pending,
         (SELECT count(*) FROM public.ai_governance_actions WHERE workspace_id=$1::uuid AND status IN ('approved','executed')) AS gov_approved,
         (SELECT count(*) FROM public.ai_feedback WHERE workspace_id=$1::uuid AND rating='up') AS feedback_up,
         (SELECT count(*) FROM public.ai_feedback WHERE workspace_id=$1::uuid AND rating='down') AS feedback_down`,
      wsid);
    const n = (k: string) => Number(r?.[k] ?? 0);
    const up = n('feedback_up'); const down = n('feedback_down');
    return {
      ai_calls_30d: n('ai_calls_30d'),
      ai_errors_30d: n('ai_errors_30d'),
      conversations: n('conversations'),
      actions_run: n('actions_run'),
      recs_new: n('recs_new'),
      recs_applied: n('recs_applied'),
      gov_pending: n('gov_pending'),
      gov_approved: n('gov_approved'),
      feedback_up: up,
      feedback_down: down,
      satisfaction: up + down > 0 ? Math.round((up / (up + down)) * 100) : 100,
    };
  }

  // ── internals ───────────────────────────────────────────────────────
  private async clinicalContext(workspaceId: string): Promise<ClinicalContext> {
    const [r] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint | null>>>(
      `SELECT
         (SELECT count(*) FROM public.clients WHERE workspace_id=$1::uuid AND status::text='active') AS active_clients,
         (SELECT count(*) FROM public.clients c WHERE c.workspace_id=$1::uuid AND c.status::text='active'
            AND NOT EXISTS (SELECT 1 FROM public.meal_logs m WHERE m.client_id=c.id AND m.logged_at >= now()-interval '7 days')) AS at_risk,
         (SELECT COALESCE(round(avg(progress_pct)),0) FROM public.program_assignments WHERE workspace_id=$1::uuid AND status IN ('active','completed')) AS avg_progress,
         (SELECT count(*) FROM public.program_assignments WHERE workspace_id=$1::uuid AND status='active') AS active_programs,
         (SELECT count(*) FROM public.clients WHERE workspace_id=$1::uuid AND created_at >= now()-interval '30 days') AS new_clients_30d`,
      workspaceId);
    const n = (k: string) => Number(r?.[k] ?? 0);
    return { active_clients: n('active_clients'), at_risk: n('at_risk'), avg_progress: n('avg_progress'), active_programs: n('active_programs'), new_clients_30d: n('new_clients_30d') };
  }
}

export interface RecRow {
  id: string; workspace_id: string | null; scope: string; type: string; title: string; body: string;
  severity: string; source: string; status: string; metadata: unknown; created_at: string; updated_at: string;
}
export interface GovRow {
  id: string; workspace_id: string; assistant_type: string | null; proposed_by: string; action_type: string;
  title: string; description: string | null; params: unknown; status: string; reviewed_by: string | null;
  reviewed_at: string | null; review_note: string | null; result: unknown; created_at: string;
}

/** Workspace clinical snapshot the rule engine reasons over. */
interface ClinicalContext {
  active_clients: number;
  at_risk: number;
  avg_progress: number;
  active_programs: number;
  new_clients_30d: number;
}

