import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type {
  AutomationRule,
  AutomationRun,
  CreateAutomationRuleInput,
  UpdateAutomationRuleInput,
} from './automation.types';

/**
 * AutomationService — CRUD over automation_rules and read-side for runs.
 *
 * The EXECUTION side lives in AutomationExecutor (which subscribes to
 * ACTIVITY_RECORDED_EVENT and uses this service to fetch matching rules).
 */
@Injectable()
export class AutomationService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Rule CRUD ─────────────────────────────────────────────────────

  async list(workspaceId: string): Promise<AutomationRule[]> {
    const rows = await this.prisma.automation_rules.findMany({
      where: { workspace_id: workspaceId },
      orderBy: [{ name: 'asc' }],
    });
    return rows.map(toRule);
  }

  async get(workspaceId: string, ruleId: string): Promise<AutomationRule> {
    const row = await this.prisma.automation_rules.findFirst({
      where: { id: ruleId, workspace_id: workspaceId },
    });
    if (!row) throw new NotFoundException(`Automation rule ${ruleId} not found.`);
    return toRule(row);
  }

  async create(
    workspaceId: string,
    actorUserId: string,
    input: CreateAutomationRuleInput,
  ): Promise<AutomationRule> {
    if (!input.name?.trim()) throw new BadRequestException('name is required.');
    if (!input.trigger_event?.trim()) {
      throw new BadRequestException('trigger_event is required.');
    }
    if (!input.actions?.length) {
      throw new BadRequestException('At least one action is required.');
    }
    validateActions(input.actions);

    const row = await this.prisma.automation_rules.create({
      data: {
        workspace_id: workspaceId,
        created_by_user_id: actorUserId,
        name: input.name.trim(),
        description: input.description ?? null,
        is_enabled: input.is_enabled ?? true,
        trigger_event: input.trigger_event.trim(),
        conditions: (input.conditions ?? []) as unknown as Prisma.InputJsonValue,
        actions: input.actions as unknown as Prisma.InputJsonValue,
      },
    });
    return toRule(row);
  }

  async update(
    workspaceId: string,
    ruleId: string,
    input: UpdateAutomationRuleInput,
  ): Promise<AutomationRule> {
    const existing = await this.prisma.automation_rules.findFirst({
      where: { id: ruleId, workspace_id: workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Automation rule ${ruleId} not found.`);
    if (input.actions) validateActions(input.actions);

    const data: Prisma.automation_rulesUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description;
    if (input.is_enabled !== undefined) data.is_enabled = input.is_enabled;
    if (input.trigger_event !== undefined) data.trigger_event = input.trigger_event.trim();
    if (input.conditions !== undefined) {
      data.conditions = input.conditions as unknown as Prisma.InputJsonValue;
    }
    if (input.actions !== undefined) {
      data.actions = input.actions as unknown as Prisma.InputJsonValue;
    }

    const row = await this.prisma.automation_rules.update({
      where: { id: ruleId },
      data,
    });
    return toRule(row);
  }

  async remove(workspaceId: string, ruleId: string): Promise<{ id: string }> {
    const existing = await this.prisma.automation_rules.findFirst({
      where: { id: ruleId, workspace_id: workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Automation rule ${ruleId} not found.`);
    await this.prisma.automation_rules.delete({ where: { id: ruleId } });
    return { id: ruleId };
  }

  // ── Run log ───────────────────────────────────────────────────────

  async listRuns(
    workspaceId: string,
    opts: { ruleId?: string; limit?: number; offset?: number } = {},
  ): Promise<AutomationRun[]> {
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const offset = Math.max(0, opts.offset ?? 0);
    const where: Prisma.automation_runsWhereInput = { workspace_id: workspaceId };
    if (opts.ruleId) where.rule_id = opts.ruleId;

    const rows = await this.prisma.automation_runs.findMany({
      where,
      orderBy: [{ started_at: 'desc' }],
      take: limit,
      skip: offset,
      include: { automation_rules: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      rule_id: r.rule_id,
      rule_name: r.automation_rules?.name,
      workspace_id: r.workspace_id,
      activity_log_id: r.activity_log_id,
      status: r.status as AutomationRun['status'],
      trigger_event: r.trigger_event,
      input_payload: r.input_payload,
      action_results: (r.action_results as unknown as AutomationRun['action_results']) ?? [],
      error_message: r.error_message,
      started_at: r.started_at.toISOString(),
      completed_at: r.completed_at?.toISOString() ?? null,
      latency_ms: r.latency_ms,
    }));
  }

  // ── Used by the executor — internal API ───────────────────────────

  /** Enabled rules whose trigger matches the event. Includes wildcard `any.{action}`. */
  async findMatchingRules(workspaceId: string, triggerEvent: string): Promise<AutomationRule[]> {
    // e.g. 'recipe.create' → also match 'any.create'
    const [, action] = triggerEvent.split('.');
    const triggers = [triggerEvent];
    if (action) triggers.push(`any.${action}`);

    const rows = await this.prisma.automation_rules.findMany({
      where: {
        workspace_id: workspaceId,
        is_enabled: true,
        trigger_event: { in: triggers },
      },
    });
    return rows.map(toRule);
  }

  async recordRun(input: {
    rule_id: string;
    workspace_id: string;
    activity_log_id: string | null;
    status: AutomationRun['status'];
    trigger_event: string;
    input_payload: unknown;
    action_results: AutomationRun['action_results'];
    error_message: string | null;
    latency_ms: number;
  }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.automation_runs.create({
        data: {
          rule_id: input.rule_id,
          workspace_id: input.workspace_id,
          activity_log_id: input.activity_log_id,
          status: input.status,
          trigger_event: input.trigger_event,
          input_payload: input.input_payload == null
            ? Prisma.DbNull
            : (input.input_payload as Prisma.InputJsonValue),
          action_results: input.action_results as unknown as Prisma.InputJsonValue,
          error_message: input.error_message,
          completed_at: new Date(),
          latency_ms: input.latency_ms,
        },
      }),
      this.prisma.automation_rules.update({
        where: { id: input.rule_id },
        data: {
          fire_count: { increment: 1 },
          last_fired_at: new Date(),
          last_error: input.status === 'failed' ? input.error_message : null,
        },
      }),
    ]);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

interface RawRuleRow {
  id: string;
  workspace_id: string;
  created_by_user_id: string | null;
  name: string;
  description: string | null;
  is_enabled: boolean;
  trigger_event: string;
  conditions: unknown;
  actions: unknown;
  fire_count: bigint | number;
  last_fired_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

function toRule(r: RawRuleRow): AutomationRule {
  return {
    id: r.id,
    workspace_id: r.workspace_id,
    created_by_user_id: r.created_by_user_id,
    name: r.name,
    description: r.description,
    is_enabled: r.is_enabled,
    trigger_event: r.trigger_event,
    conditions: (r.conditions as AutomationRule['conditions']) ?? [],
    actions: (r.actions as AutomationRule['actions']) ?? [],
    fire_count: Number(r.fire_count ?? 0),
    last_fired_at: r.last_fired_at?.toISOString() ?? null,
    last_error: r.last_error,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
}

function validateActions(actions: unknown[]): void {
  for (const [i, a] of actions.entries()) {
    if (!a || typeof a !== 'object') {
      throw new BadRequestException(`Action ${i + 1}: not an object.`);
    }
    const action = a as { type?: unknown };
    if (action.type === 'notify.message') {
      const m = a as { title?: unknown; body?: unknown };
      if (!m.title || typeof m.title !== 'string') {
        throw new BadRequestException(`Action ${i + 1}: notify.message requires a title.`);
      }
      if (!m.body || typeof m.body !== 'string') {
        throw new BadRequestException(`Action ${i + 1}: notify.message requires a body.`);
      }
    } else if (action.type === 'webhook.post') {
      const w = a as { url?: unknown };
      if (!w.url || typeof w.url !== 'string' || !/^https?:\/\//i.test(w.url)) {
        throw new BadRequestException(`Action ${i + 1}: webhook.post requires a valid http(s) URL.`);
      }
    } else {
      throw new BadRequestException(`Action ${i + 1}: unknown type "${String(action.type)}".`);
    }
  }
}
