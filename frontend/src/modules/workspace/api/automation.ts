import { api } from '@/lib/api';

// ─── Types — mirror backend/src/automation/automation.types.ts ──────

export type ConditionOperator =
  | 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'exists' | 'not_exists';

export interface AutomationCondition {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export type ActionType = 'notify.message' | 'webhook.post';

export interface NotifyMessageAction {
  type: 'notify.message';
  title: string;
  body: string;
  recipient_scope: 'workspace';
}

export interface WebhookPostAction {
  type: 'webhook.post';
  url: string;
  headers?: Record<string, string>;
}

export type AutomationAction = NotifyMessageAction | WebhookPostAction;

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

export interface CreateRuleInput {
  name: string;
  description?: string | null;
  is_enabled?: boolean;
  trigger_event: string;
  conditions?: AutomationCondition[];
  actions: AutomationAction[];
}

export type UpdateRuleInput = Partial<CreateRuleInput>;

// ─── API ────────────────────────────────────────────────────────────

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const automationApi = {
  listRules: () =>
    api.get<AutomationRule[]>('/api/v1/workspaces/me/automation/rules'),

  getRule: (id: string) =>
    api.get<AutomationRule>(`/api/v1/workspaces/me/automation/rules/${id}`),

  createRule: (body: CreateRuleInput) =>
    api.post<AutomationRule>('/api/v1/workspaces/me/automation/rules', { body }),

  updateRule: (id: string, body: UpdateRuleInput) =>
    api.patch<AutomationRule>(`/api/v1/workspaces/me/automation/rules/${id}`, { body }),

  removeRule: (id: string) =>
    api.delete<{ id: string }>(`/api/v1/workspaces/me/automation/rules/${id}`),

  listRuns: (params: { ruleId?: string; limit?: number; offset?: number } = {}) =>
    api.get<AutomationRun[]>(`/api/v1/workspaces/me/automation/runs${qs(params)}`),
};

// ─── Display helpers ────────────────────────────────────────────────

export const TRIGGER_EVENTS: Array<{ value: string; label: string }> = [
  { value: 'client.create',      label: 'Client created' },
  { value: 'client.update',      label: 'Client updated' },
  { value: 'invite.create',      label: 'Client invited' },
  { value: 'recipe.create',      label: 'Recipe created' },
  { value: 'recipe.update',      label: 'Recipe updated' },
  { value: 'recipe.delete',      label: 'Recipe deleted' },
  { value: 'meal_log.create',    label: 'Meal logged' },
  { value: 'measurement.create', label: 'Measurement added' },
  { value: 'appointment.create', label: 'Appointment booked' },
  { value: 'program.create',     label: 'Program created' },
  { value: 'any.create',         label: 'Anything created' },
  { value: 'any.update',         label: 'Anything updated' },
  { value: 'any.delete',         label: 'Anything deleted' },
];

export const CONDITION_FIELDS: string[] = [
  'actor_role', 'entity_type', 'entity_id', 'action',
  'http_method', 'route', 'status_code', 'latency_ms',
];

export const OPERATOR_LABEL: Record<ConditionOperator, string> = {
  eq:         'equals',
  neq:        'not equals',
  contains:   'contains',
  gt:         'greater than',
  lt:         'less than',
  exists:     'exists',
  not_exists: 'does not exist',
};
