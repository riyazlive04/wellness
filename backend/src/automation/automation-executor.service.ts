import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  ACTIVITY_RECORDED_EVENT,
  type ActivityRecordedEvent,
} from '../activity-log/activity-log.types';
import { AutomationService } from './automation.service';
import type {
  AutomationAction,
  AutomationCondition,
  AutomationRule,
  AutomationRun,
  ConditionOperator,
  NotifyMessageAction,
  WebhookPostAction,
} from './automation.types';

/** Per-action timeout — webhooks especially must not hang the executor. */
const ACTION_TIMEOUT_MS = 5_000;
const MAX_HEADER_VALUE_LEN = 256;

/**
 * AutomationExecutor — listens for activity events, finds matching rules,
 * evaluates conditions, runs actions.
 *
 * Boundary contract:
 *   - Reads ACTIVITY_RECORDED_EVENT (workspace + entity + action + payload)
 *   - Writes automation_runs rows
 *   - Writes 'notification' activity_logs rows (for notify.message actions)
 *
 * Failures never propagate back to the user request — the originating HTTP
 * call has already returned before this runs. We log + record run status.
 */
@Injectable()
export class AutomationExecutor {
  private readonly logger = new Logger(AutomationExecutor.name);

  constructor(
    private readonly automations: AutomationService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(ACTIVITY_RECORDED_EVENT, { async: true })
  async handle(event: ActivityRecordedEvent): Promise<void> {
    if (!event.workspace_id) return;          // skip platform-level activity
    if (event.status_code >= 400) return;     // failures don't trigger rules
    if (!event.entity_type) return;
    // Notifications written by US shouldn't re-trigger rules — would create
    // an infinite fan-out of "notification.create → run rule → write
    // notification → run rule…".
    if (event.entity_type === 'notification') return;

    const trigger = `${event.entity_type}.${event.action}`;
    const rules = await this.automations.findMatchingRules(event.workspace_id, trigger);
    if (rules.length === 0) return;

    // Load the full activity_logs row so condition evaluation can read payload.
    const activityRow = await this.prisma.activity_logs.findUnique({
      where: { id: event.id },
    });
    const evalContext = buildEvalContext(event, activityRow);

    // Run each matching rule independently; one failing rule doesn't block others.
    await Promise.all(
      rules.map((rule) => this.runRule(rule, trigger, evalContext, event.id).catch((err) => {
        this.logger.warn(`Rule ${rule.id} crashed: ${(err as Error).message}`);
      })),
    );
  }

  private async runRule(
    rule: AutomationRule,
    trigger: string,
    evalContext: Record<string, unknown>,
    activityLogId: string,
  ): Promise<void> {
    const t0 = Date.now();

    // ── Evaluate conditions ─────────────────────────────────────────
    const conditionsHold = evaluateConditions(rule.conditions, evalContext);
    if (!conditionsHold) {
      await this.automations.recordRun({
        rule_id: rule.id,
        workspace_id: rule.workspace_id,
        activity_log_id: activityLogId,
        status: 'skipped',
        trigger_event: trigger,
        input_payload: { event: evalContext, reason: 'conditions_false' },
        action_results: [],
        error_message: null,
        latency_ms: Date.now() - t0,
      });
      return;
    }

    // ── Run actions in order ────────────────────────────────────────
    const actionResults: AutomationRun['action_results'] = [];
    let runStatus: AutomationRun['status'] = 'success';
    let runError: string | null = null;

    for (const action of rule.actions) {
      const aStart = Date.now();
      try {
        const detail = await this.executeAction(action, rule, evalContext, activityLogId);
        actionResults.push({
          type: action.type,
          status: 'success',
          detail,
          latency_ms: Date.now() - aStart,
        });
      } catch (err) {
        runStatus = 'failed';
        runError = (err as Error).message;
        actionResults.push({
          type: action.type,
          status: 'failed',
          detail: (err as Error).message,
          latency_ms: Date.now() - aStart,
        });
        // Continue running remaining actions — partial success is still useful
        // and the failure detail is per-action in the log.
      }
    }

    await this.automations.recordRun({
      rule_id: rule.id,
      workspace_id: rule.workspace_id,
      activity_log_id: activityLogId,
      status: runStatus,
      trigger_event: trigger,
      input_payload: evalContext,
      action_results: actionResults,
      error_message: runError,
      latency_ms: Date.now() - t0,
    });
  }

  // ── Action dispatch ──────────────────────────────────────────────

  private async executeAction(
    action: AutomationAction,
    rule: AutomationRule,
    ctx: Record<string, unknown>,
    activityLogId: string,
  ): Promise<string> {
    switch (action.type) {
      case 'notify.message':
        return this.executeNotify(action, rule, ctx, activityLogId);
      case 'webhook.post':
        return this.executeWebhook(action, rule, ctx);
      default: {
        const _exhaustive: never = action;
        throw new Error(`Unknown action type: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  private async executeNotify(
    action: NotifyMessageAction,
    rule: AutomationRule,
    ctx: Record<string, unknown>,
    activityLogId: string,
  ): Promise<string> {
    const title = renderTemplate(action.title, ctx);
    const body  = renderTemplate(action.body, ctx);
    await this.prisma.activity_logs.create({
      data: {
        workspace_id: rule.workspace_id,
        actor_user_id: null,
        actor_role: 'system',
        http_method: 'INTERNAL',
        route: `/automation/${rule.id}/notify`,
        entity_type: 'notification',
        entity_id: null,
        action: 'invoke',
        request_id: null,
        status_code: 200,
        latency_ms: 0,
        ip: null,
        user_agent: null,
        payload: {
          rule_id: rule.id,
          rule_name: rule.name,
          source_activity_log_id: activityLogId,
          title,
          body,
        } as Prisma.InputJsonValue,
        error_message: null,
      },
    });
    return `notified workspace · "${title}"`;
  }

  private async executeWebhook(
    action: WebhookPostAction,
    rule: AutomationRule,
    ctx: Record<string, unknown>,
  ): Promise<string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-sirah-source': `automation/${rule.id}`,
      'x-sirah-rule-name': rule.name.slice(0, MAX_HEADER_VALUE_LEN),
    };
    if (action.headers) {
      for (const [k, v] of Object.entries(action.headers)) {
        if (typeof v === 'string') {
          headers[k.toLowerCase()] = v.slice(0, MAX_HEADER_VALUE_LEN);
        }
      }
    }

    const body = JSON.stringify({
      rule_id: rule.id,
      rule_name: rule.name,
      fired_at: new Date().toISOString(),
      event: ctx,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ACTION_TIMEOUT_MS);
    try {
      const resp = await fetch(action.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      return `POST ${action.url} → ${resp.status}`;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ─── Condition evaluation ────────────────────────────────────────────

function buildEvalContext(
  event: ActivityRecordedEvent,
  activityRow: { payload: unknown; route: string; status_code: number } | null,
): Record<string, unknown> {
  return {
    workspace_id: event.workspace_id,
    actor_user_id: event.actor_user_id,
    actor_role: event.actor_role,
    http_method: event.http_method,
    route: event.route,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    action: event.action,
    status_code: event.status_code,
    latency_ms: event.latency_ms,
    payload: activityRow?.payload ?? null,
  };
}

function evaluateConditions(
  conditions: AutomationCondition[],
  ctx: Record<string, unknown>,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => evalSingle(c, ctx));
}

function evalSingle(c: AutomationCondition, ctx: Record<string, unknown>): boolean {
  const v = readPath(ctx, c.field);
  switch (c.operator as ConditionOperator) {
    case 'eq':       return v === c.value;
    case 'neq':      return v !== c.value;
    case 'contains': return contains(v, c.value);
    case 'gt':       return typeof v === 'number' && typeof c.value === 'number' && v > c.value;
    case 'lt':       return typeof v === 'number' && typeof c.value === 'number' && v < c.value;
    case 'exists':       return v !== null && v !== undefined;
    case 'not_exists':   return v === null || v === undefined;
    default:         return false;
  }
}

function contains(v: unknown, target: unknown): boolean {
  if (typeof v === 'string' && typeof target === 'string') return v.includes(target);
  if (Array.isArray(v)) return v.includes(target);
  return false;
}

function readPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const segments = path.split('.');
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

// ─── Template rendering ──────────────────────────────────────────────

/**
 * Minimal handlebars-style placeholder substitution.
 *   "Recipe created: {{entity_id}} by {{actor_role}}"
 * Unknown placeholders are left as-is for visibility while authoring.
 */
function renderTemplate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const v = readPath(ctx, path);
    if (v == null) return `{{${path}}}`;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    try { return JSON.stringify(v); } catch { return `{{${path}}}`; }
  });
}
