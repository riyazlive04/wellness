export type UsageService = 'chat' | 'voice' | 'vision';
export type UsageProvider = 'gemini' | 'claude' | 'openai' | string;
export type UsageStatus = 'success' | 'error';

export interface RecordUsageInput {
  workspaceId: string | null;
  userId: string | null;
  service: UsageService;
  provider: UsageProvider;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  latencyMs?: number | null;
  /** Cost in micro-INR (1 INR = 1,000,000). Computed by caller from model rates. */
  costMicroInr?: number | null;
  status: UsageStatus;
  errorCode?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UsageSnapshot {
  total_calls: number;
  errors: number;
  success_rate: number;
  total_tokens: number;
  total_cost_inr: number;
  last_24h_calls: number;
  last_24h_cost_inr: number;
  last_24h_tokens: number;
  unique_workspaces_30d: number;
}

export interface UsageByService {
  service: UsageService;
  calls: number;
  tokens: number;
  cost_inr: number;
  avg_latency_ms: number;
}

export interface UsageByWorkspace {
  workspace_id: string;
  workspace_name: string | null;
  calls: number;
  tokens: number;
  cost_inr: number;
  /** Quota status — 'ok' | 'warn' (>=80%) | 'over' (>=100%). */
  quota_status: 'ok' | 'warn' | 'over' | 'unknown';
  quota_limit: number | null;
}

export interface UsageTrendPoint {
  /** ISO YYYY-MM-DD (UTC bucket). */
  day: string;
  calls: number;
  tokens: number;
  cost_inr: number;
}

export interface UsageAnomalyAlert {
  workspace_id: string | null;
  workspace_name: string | null;
  /** Calls in last 24h. */
  calls_24h: number;
  /** Calls in previous 24h (the day before). */
  calls_prev_24h: number;
  /** Multiplier — calls_24h / max(1, calls_prev_24h). */
  multiplier: number;
}