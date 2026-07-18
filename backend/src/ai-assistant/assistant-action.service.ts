import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BillingAutomationService } from '../billing/billing-automation.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import { AssistantContextService } from './assistant-context.service';
import { AssistantMemoryService } from './assistant-memory.service';
import type { AssistantType } from './assistant.types';

export interface ActionDef {
  type: string;
  label: string;
  description: string;
  /** Whether the action changes state (vs a read/report). Drives a confirm in the UI. */
  mutating?: boolean;
}

/**
 * The action catalog per assistant. Kept deliberately small + safe: reads and
 * reports for every role, plus a couple of genuine state-changing actions that
 * reuse existing, permission-checked services.
 */
const ACTIONS: Record<AssistantType, ActionDef[]> = {
  executive: [
    { type: 'platform_report', label: 'Generate platform report', description: 'Produce a written platform health + revenue report.' },
    { type: 'list_trial_expiries', label: 'List trial expiries', description: 'Workspaces whose trial ends within 7 days.' },
    { type: 'list_payment_failures', label: 'List payment failures', description: 'Recent failed payments needing attention.' },
    { type: 'run_billing_automation', label: 'Run billing automation', description: 'Trigger trial/renewal/dunning/downgrade jobs now.', mutating: true },
  ],
  clinical: [
    { type: 'todays_appointments', label: "Today's appointments", description: "List today's scheduled appointments." },
    { type: 'clients_attention', label: 'Clients needing attention', description: 'Active clients with no meal logs in 3 days.' },
    { type: 'draft_weekly_report', label: 'Draft a weekly report', description: 'Draft a weekly progress summary for a client (params: client_id).' },
  ],
  wellness: [
    { type: 'todays_summary', label: "Today's summary", description: 'Summarise your meals, goals, and next steps today.' },
    { type: 'set_goal', label: 'Set a wellness goal', description: 'Remember a wellness goal (params: goal).', mutating: true },
    { type: 'log_habit', label: 'Log a habit', description: 'Record a habit you completed today (params: habit).', mutating: true },
  ],
};

/**
 * AssistantActionService — the action framework (Module 6 — AI Action Framework).
 * Every action follows: validate → permission check → execute → log. Each run
 * is recorded in `assistant_actions` (executed/failed) as an audit trail; the
 * model only ever *suggests* these, the user confirms, and this service runs them.
 */
@Injectable()
export class AssistantActionService {
  private readonly logger = new Logger(AssistantActionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: AssistantContextService,
    private readonly memory: AssistantMemoryService,
    private readonly billingAutomation: BillingAutomationService,
  ) {}

  catalog(type: AssistantType): ActionDef[] {
    return ACTIONS[type];
  }

  async execute(
    user: AuthUser,
    type: AssistantType,
    actionType: string,
    params: Record<string, unknown>,
    conversationId?: string | null,
  ): Promise<{ summary: string; result: unknown }> {
    // 1. Validate the action exists for this assistant.
    const def = ACTIONS[type].find((a) => a.type === actionType);
    if (!def) throw new BadRequestException(`Unknown action "${actionType}" for ${type} assistant.`);

    // 2. Permission check (role boundary).
    this.assertPermission(user, type);

    // 3. Execute + 4. Log (success or failure).
    try {
      const out = await this.run(user, type, actionType, params);
      await this.record(user, type, actionType, params, 'executed', out.result, null, conversationId);
      return out;
    } catch (err) {
      await this.record(user, type, actionType, params, 'failed', null, (err as Error).message, conversationId);
      throw err;
    }
  }

  private assertPermission(user: AuthUser, type: AssistantType): void {
    if (type === 'executive' && !user.isSuperAdmin) throw new ForbiddenException('Executive actions require super admin.');
    if (type === 'clinical' && !user.workspaceRole) throw new ForbiddenException('Clinical actions require a workspace role.');
    // wellness actions are self-scoped — any authenticated user may run them.
  }

  private async run(
    user: AuthUser,
    type: AssistantType,
    actionType: string,
    params: Record<string, unknown>,
  ): Promise<{ summary: string; result: unknown }> {
    switch (actionType) {
      // ── Executive ──
      case 'platform_report': {
        const ctx = await this.context.build(user, 'executive');
        return { summary: 'Platform report generated.', result: ctx.data };
      }
      case 'list_trial_expiries': {
        const rows = await this.prisma.$queryRawUnsafe(
          `SELECT id, name, trial_ends_at FROM public.workspaces
            WHERE plan = 'trial' AND trial_ends_at BETWEEN now() AND now() + interval '7 days'
            ORDER BY trial_ends_at ASC LIMIT 50`,
        );
        return { summary: `${(rows as unknown[]).length} trial(s) expiring within 7 days.`, result: rows };
      }
      case 'list_payment_failures': {
        const rows = await this.prisma.$queryRawUnsafe(
          `SELECT p.id, p.amount_paise, p.error_description, p.created_at, w.name AS workspace
             FROM public.payments p LEFT JOIN public.workspaces w ON w.id = p.workspace_id
            WHERE p.status = 'failed' AND COALESCE(p.failed_at, p.created_at) >= now() - interval '30 days'
            ORDER BY COALESCE(p.failed_at, p.created_at) DESC LIMIT 50`,
        );
        return { summary: `${(rows as unknown[]).length} payment failure(s) in the last 30 days.`, result: rows };
      }
      case 'run_billing_automation': {
        const summary = await this.billingAutomation.runAll();
        return { summary: 'Billing automation jobs executed.', result: summary };
      }

      // ── Clinical ──
      case 'todays_appointments': {
        const ctx = await this.context.build(user, 'clinical');
        return { summary: `${ctx.data.appointments_today_count ?? 0} appointment(s) today.`, result: ctx.data.appointments_today ?? [] };
      }
      case 'clients_attention': {
        if (!user.workspaceId) throw new BadRequestException('No workspace in context.');
        const rows = await this.prisma.$queryRawUnsafe(
          `SELECT c.id, c.name, c.email FROM public.clients c
            WHERE c.workspace_id = $1::uuid AND c.status::text = 'active'
              AND NOT EXISTS (SELECT 1 FROM public.meal_logs m WHERE m.client_id = c.id AND m.logged_at >= now() - interval '3 days')
            ORDER BY c.name LIMIT 50`,
          user.workspaceId,
        );
        return { summary: `${(rows as unknown[]).length} client(s) with no logs in 3 days.`, result: rows };
      }
      case 'draft_weekly_report': {
        const clientId = typeof params.client_id === 'string' ? params.client_id : null;
        if (!clientId) throw new BadRequestException('client_id is required.');
        if (!user.workspaceId) throw new BadRequestException('No workspace in context.');
        const [c] = await this.prisma.$queryRawUnsafe<Array<{ name: string | null; goals: string | null; target_kcal: number | null }>>(
          `SELECT name, goals, target_kcal FROM public.clients WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
          clientId,
          user.workspaceId,
        );
        if (!c) throw new BadRequestException('Client not found in your workspace.');
        const draft = `Weekly progress draft for ${c.name ?? 'client'} - goal: ${c.goals ?? 'n/a'}, target ${c.target_kcal ?? 'n/a'} kcal. Review adherence, highlight wins, and set next week's focus.`;
        return { summary: 'Weekly report draft prepared.', result: { client_id: clientId, draft } };
      }

      // ── Wellness ──
      case 'todays_summary': {
        const ctx = await this.context.build(user, 'wellness');
        return { summary: 'Here is your day so far.', result: ctx.data };
      }
      case 'set_goal': {
        const goal = typeof params.goal === 'string' ? params.goal : '';
        if (!goal.trim()) throw new BadRequestException('goal is required.');
        await this.memory.remember(user, 'wellness', 'wellness_goal', goal, 'user');
        return { summary: 'Goal saved - I’ll keep it in mind.', result: { goal } };
      }
      case 'log_habit': {
        const habit = typeof params.habit === 'string' ? params.habit : '';
        if (!habit.trim()) throw new BadRequestException('habit is required.');
        await this.memory.remember(user, 'wellness', `habit:${habit.toLowerCase().slice(0, 40)}`, `done ${new Date().toISOString().slice(0, 10)}`, 'inferred');
        return { summary: `Nice - logged "${habit}".`, result: { habit } };
      }

      default:
        throw new BadRequestException(`Action "${actionType}" has no handler.`);
    }
  }

  private async record(
    user: AuthUser,
    type: AssistantType,
    actionType: string,
    params: Record<string, unknown>,
    status: 'executed' | 'failed',
    result: unknown,
    error: string | null,
    conversationId?: string | null,
  ): Promise<void> {
    try {
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO public.assistant_actions
           (conversation_id, user_id, workspace_id, assistant_type, action_type, status, params, result, error)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`,
        conversationId ?? null,
        user.id,
        user.workspaceId,
        type,
        actionType,
        status,
        JSON.stringify(params ?? {}),
        result == null ? null : JSON.stringify(result),
        error,
      );
    } catch (err) {
      this.logger.warn(`Failed to record assistant action: ${(err as Error).message}`);
    }
  }
}
