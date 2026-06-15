/**
 * Automation Engine — typed contracts for rules, conditions, and actions.
 *
 * Rules are workspace-scoped JSON documents that subscribe to a trigger event
 * (entity.action format derived from ACTIVITY_RECORDED_EVENT) and execute
 * actions in order when their conditions match.
 *
 * Keep these shapes BACKWARD-COMPATIBLE: adding a new action type or operator
 * is fine; renaming or removing existing ones requires a migration script
 * because rule bodies are JSONB blobs persisted by users.
 */

/** Operator vocabulary for conditions. */
export type ConditionOperator =
  | 'eq'           // equals
  | 'neq'          // not equals
  | 'contains'     // substring (strings) or array.includes
  | 'gt'           // numeric > value
  | 'lt'           // numeric < value
  | 'exists'       // field is present + non-null
  | 'not_exists';  // field is null or missing

/** A single condition: dot-path field + operator + comparison value. */
export interface AutomationCondition {
  /** Dot path into the event payload. e.g. 'actor_role', 'entity_type'. */
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

// ─── Actions ────────────────────────────────────────────────────────

export type ActionType =
  | 'notify.message'
  | 'webhook.post'
  | 'message.send'
  | 'push.send'
  | 'ai.summarize';

/** Who a recipient-bearing action targets. `trigger_client` = the client the
 *  triggering event was about (only resolvable when the event entity is a
 *  client). `workspace_staff` = all owners/nutritionists in the workspace. */
export type ActionRecipient = 'trigger_client' | 'workspace_staff';

/**
 * notify.message — writes a 'notification' activity_logs row so it surfaces
 * in the Activity feed. The title + body strings support {{handlebars}}
 * placeholders that pull from the trigger event (e.g. {{entity_type}}).
 */
export interface NotifyMessageAction {
  type: 'notify.message';
  title: string;
  body: string;
  /** Who the notification is for. v1 supports 'workspace' (broadcast). */
  recipient_scope: 'workspace';
}

/**
 * webhook.post — outbound HTTP POST to a URL. Body is the event payload +
 * the rule id + a timestamp. Always sent with X-Sirah-Source header set to
 * the rule id, so external receivers can distinguish.
 */
export interface WebhookPostAction {
  type: 'webhook.post';
  url: string;
  /** Optional extra headers — values capped to 256 chars each by the executor. */
  headers?: Record<string, string>;
}

/**
 * message.send — send a chat message to the client the event was about (plus a
 * push notification). Content supports {{handlebars}} placeholders.
 */
export interface MessageSendAction {
  type: 'message.send';
  recipient: 'trigger_client';
  content: string;
}

/**
 * push.send — web push to the triggering client or to all workspace staff.
 */
export interface PushSendAction {
  type: 'push.send';
  recipient: ActionRecipient;
  title: string;
  body: string;
  url?: string;
}

/**
 * ai.summarize — run the prompt (templated, with the event context) through the
 * AI and post the result as an in-app notification in the Activity feed.
 */
export interface AiSummarizeAction {
  type: 'ai.summarize';
  prompt: string;
}

export type AutomationAction =
  | NotifyMessageAction
  | WebhookPostAction
  | MessageSendAction
  | PushSendAction
  | AiSummarizeAction;

// ─── Rule + Run rows ────────────────────────────────────────────────

export interface AutomationRule {
  id: string;
  workspace_id: string;
  created_by_user_id: string | null;
  name: string;
  description: string | null;
  is_enabled: boolean;
  trigger_event: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  fire_count: number;
  last_fired_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type AutomationRunStatus = 'success' | 'failed' | 'skipped';

export interface AutomationRun {
  id: string;
  rule_id: string;
  rule_name?: string;
  workspace_id: string;
  activity_log_id: string | null;
  status: AutomationRunStatus;
  trigger_event: string;
  input_payload: unknown;
  action_results: Array<{
    type: ActionType;
    status: 'success' | 'failed' | 'skipped';
    detail?: string;
    latency_ms?: number;
  }>;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  latency_ms: number | null;
}

// ─── Write inputs ───────────────────────────────────────────────────

export interface CreateAutomationRuleInput {
  name: string;
  description?: string | null;
  is_enabled?: boolean;
  trigger_event: string;
  conditions?: AutomationCondition[];
  actions: AutomationAction[];
}

export interface UpdateAutomationRuleInput {
  name?: string;
  description?: string | null;
  is_enabled?: boolean;
  trigger_event?: string;
  conditions?: AutomationCondition[];
  actions?: AutomationAction[];
}
