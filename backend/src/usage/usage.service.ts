import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import {
  RecordUsageInput,
  UsageAnomalyAlert,
  UsageByService,
  UsageByWorkspace,
  UsageProvider,
  UsageService as Service,
  UsageSnapshot,
  UsageTrendPoint,
} from './usage.types';

/**
 * Per-model cost table — micro-INR per 1,000 tokens.
 * Roughly tracks public 2026 pricing; adjust as Google / Anthropic publish
 * new rates. Used by record() when a caller doesn't supply costMicroInr.
 */
const MODEL_COSTS_MICRO_INR_PER_1K_TOKENS: Record<string, number> = {
  'gemini-2.5-flash':       6_000,    // ~₹0.006 per 1k
  'gemini-2.5-pro':         60_000,
  'gemini-1.5-flash':       6_000,
  'gemini-1.5-pro':         60_000,
  'claude-haiku-4-5':       80_000,
  'claude-sonnet-4-6':      300_000,
  'claude-opus-4-7':      1_500_000,
};

const MICRO_PER_INR = 1_000_000;

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  /**
   * Persist one AI call. Never throws — failures are logged but won't break
   * the caller's response. workspaceId / userId default to the tenant context
   * so most callers can just pass {service, provider, model, tokens...}.
   */
  async record(input: Partial<RecordUsageInput> & { service: Service; provider: UsageProvider; status: 'success' | 'error' }): Promise<void> {
    try {
      const store = this.tenant.store();
      const workspaceId = input.workspaceId ?? store?.workspaceId ?? null;
      const userId      = input.userId      ?? store?.userId      ?? null;
      const totalTokens = input.totalTokens ?? sumTokens(input.inputTokens, input.outputTokens);
      const cost        = input.costMicroInr ?? estimateCost(input.model ?? null, totalTokens);

      await this.prisma.$queryRawUnsafe(
        `INSERT INTO public.ai_usage_events (
           workspace_id, user_id, service, provider, model,
           input_tokens, output_tokens, total_tokens, latency_ms, cost_micro_inr,
           status, error_code, request_id, metadata
         ) VALUES (
           $1::uuid, $2::uuid, $3, $4, $5,
           $6, $7, $8, $9, $10,
           $11, $12, $13, $14::jsonb
         )`,
        workspaceId,
        userId,
        input.service,
        input.provider,
        input.model ?? null,
        input.inputTokens ?? null,
        input.outputTokens ?? null,
        totalTokens,
        input.latencyMs ?? null,
        cost,
        input.status,
        input.errorCode ?? null,
        input.requestId ?? null,
        JSON.stringify(input.metadata ?? {}),
      );
    } catch (err) {
      this.logger.warn(`record() failed: ${(err as Error).message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Aggregates for the admin dashboard
  // ─────────────────────────────────────────────────────────────────
  async snapshot(): Promise<UsageSnapshot> {
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{
        total_calls: bigint;
        errors: bigint;
        total_tokens: bigint | null;
        total_cost: bigint | null;
        last_24h_calls: bigint;
        last_24h_tokens: bigint | null;
        last_24h_cost: bigint | null;
        unique_workspaces_30d: bigint;
      }>
    >(`
      SELECT
        COUNT(*)::bigint                                                              AS total_calls,
        COUNT(*) FILTER (WHERE status = 'error')::bigint                              AS errors,
        COALESCE(SUM(total_tokens), 0)::bigint                                        AS total_tokens,
        COALESCE(SUM(cost_micro_inr), 0)::bigint                                      AS total_cost,
        COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours')::bigint     AS last_24h_calls,
        COALESCE(SUM(total_tokens) FILTER (
          WHERE created_at >= now() - interval '24 hours'), 0)::bigint                AS last_24h_tokens,
        COALESCE(SUM(cost_micro_inr) FILTER (
          WHERE created_at >= now() - interval '24 hours'), 0)::bigint                AS last_24h_cost,
        COUNT(DISTINCT workspace_id) FILTER (
          WHERE created_at >= now() - interval '30 days' AND workspace_id IS NOT NULL
        )::bigint                                                                     AS unique_workspaces_30d
      FROM public.ai_usage_events
    `);

    const total = Number(row?.total_calls ?? 0n);
    const errors = Number(row?.errors ?? 0n);
    return {
      total_calls: total,
      errors,
      success_rate: total > 0 ? Math.round(((total - errors) / total) * 1000) / 10 : 100,
      total_tokens: Number(row?.total_tokens ?? 0n),
      total_cost_inr: round2(Number(row?.total_cost ?? 0n) / MICRO_PER_INR),
      last_24h_calls: Number(row?.last_24h_calls ?? 0n),
      last_24h_tokens: Number(row?.last_24h_tokens ?? 0n),
      last_24h_cost_inr: round2(Number(row?.last_24h_cost ?? 0n) / MICRO_PER_INR),
      unique_workspaces_30d: Number(row?.unique_workspaces_30d ?? 0n),
    };
  }

  async byService(): Promise<UsageByService[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        service: string;
        calls: bigint;
        tokens: bigint | null;
        cost: bigint | null;
        avg_latency: number | null;
      }>
    >(`
      SELECT service,
             COUNT(*)::bigint               AS calls,
             COALESCE(SUM(total_tokens), 0)::bigint   AS tokens,
             COALESCE(SUM(cost_micro_inr), 0)::bigint AS cost,
             AVG(latency_ms)::float         AS avg_latency
        FROM public.ai_usage_events
       WHERE created_at >= now() - interval '30 days'
    GROUP BY service
    ORDER BY calls DESC
    `);
    return rows.map((r) => ({
      service: r.service as Service,
      calls: Number(r.calls),
      tokens: Number(r.tokens ?? 0n),
      cost_inr: round2(Number(r.cost ?? 0n) / MICRO_PER_INR),
      avg_latency_ms: Math.round(r.avg_latency ?? 0),
    }));
  }

  async topWorkspaces(limit = 15): Promise<UsageByWorkspace[]> {
    const lim = Math.min(50, Math.max(1, limit));
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        workspace_id: string | null;
        workspace_name: string | null;
        plan: string | null;
        calls: bigint;
        tokens: bigint | null;
        cost: bigint | null;
      }>
    >(
      `
      SELECT a.workspace_id,
             w.name        AS workspace_name,
             w.plan        AS plan,
             COUNT(*)::bigint                  AS calls,
             COALESCE(SUM(total_tokens), 0)::bigint   AS tokens,
             COALESCE(SUM(cost_micro_inr), 0)::bigint AS cost
        FROM public.ai_usage_events a
        LEFT JOIN public.workspaces w ON w.id = a.workspace_id
       WHERE a.created_at >= date_trunc('month', now())
         AND a.workspace_id IS NOT NULL
    GROUP BY a.workspace_id, w.name, w.plan
    ORDER BY calls DESC
       LIMIT $1
      `,
      lim,
    );

    // Plan → call quota mapping. Pulled from platform_config eventually; for
    // now mirror the 4 plans we seeded in 20260603100000.
    const planQuotas: Record<string, number> = {
      starter: 1_000,
      pro: 5_000,
      scale: 15_000,
      enterprise: 50_000,
    };
    return rows.map((r) => {
      const calls = Number(r.calls);
      const quota = r.plan ? planQuotas[r.plan] ?? null : null;
      let qs: UsageByWorkspace['quota_status'] = 'unknown';
      if (quota) {
        const pct = calls / quota;
        qs = pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok';
      }
      return {
        workspace_id: r.workspace_id!,
        workspace_name: r.workspace_name,
        calls,
        tokens: Number(r.tokens ?? 0n),
        cost_inr: round2(Number(r.cost ?? 0n) / MICRO_PER_INR),
        quota_status: qs,
        quota_limit: quota,
      };
    });
  }

  async trend(days = 30): Promise<UsageTrendPoint[]> {
    const d = Math.max(1, Math.min(90, days));
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ day: Date; calls: bigint; tokens: bigint | null; cost: bigint | null }>
    >(
      `
      SELECT date_trunc('day', created_at)               AS day,
             COUNT(*)::bigint                            AS calls,
             COALESCE(SUM(total_tokens), 0)::bigint      AS tokens,
             COALESCE(SUM(cost_micro_inr), 0)::bigint    AS cost
        FROM public.ai_usage_events
       WHERE created_at >= date_trunc('day', now()) - ($1 || ' days')::interval
    GROUP BY 1
    ORDER BY 1 ASC
      `,
      String(d - 1),
    );
    return rows.map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      calls: Number(r.calls),
      tokens: Number(r.tokens ?? 0n),
      cost_inr: round2(Number(r.cost ?? 0n) / MICRO_PER_INR),
    }));
  }

  async anomalies(): Promise<UsageAnomalyAlert[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        workspace_id: string | null;
        workspace_name: string | null;
        calls_24h: bigint;
        calls_prev_24h: bigint;
      }>
    >(`
      SELECT a.workspace_id,
             w.name AS workspace_name,
             COUNT(*) FILTER (WHERE a.created_at >= now() - interval '24 hours')::bigint AS calls_24h,
             COUNT(*) FILTER (
               WHERE a.created_at <  now() - interval '24 hours'
                 AND a.created_at >= now() - interval '48 hours'
             )::bigint AS calls_prev_24h
        FROM public.ai_usage_events a
        LEFT JOIN public.workspaces w ON w.id = a.workspace_id
       WHERE a.created_at >= now() - interval '48 hours'
         AND a.workspace_id IS NOT NULL
    GROUP BY a.workspace_id, w.name
      HAVING COUNT(*) FILTER (WHERE a.created_at >= now() - interval '24 hours') >= 50
         AND COUNT(*) FILTER (WHERE a.created_at >= now() - interval '24 hours') >=
             5 * GREATEST(1, COUNT(*) FILTER (
               WHERE a.created_at <  now() - interval '24 hours'
                 AND a.created_at >= now() - interval '48 hours'))
    ORDER BY calls_24h DESC
       LIMIT 10
    `);
    return rows.map((r) => {
      const c24 = Number(r.calls_24h);
      const cP = Number(r.calls_prev_24h);
      return {
        workspace_id: r.workspace_id,
        workspace_name: r.workspace_name,
        calls_24h: c24,
        calls_prev_24h: cP,
        multiplier: Math.round((c24 / Math.max(1, cP)) * 10) / 10,
      };
    });
  }
}

function sumTokens(a?: number | null, b?: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

function estimateCost(model: string | null, totalTokens: number | null): number | null {
  if (!model || !totalTokens) return null;
  const rate = MODEL_COSTS_MICRO_INR_PER_1K_TOKENS[model];
  if (!rate) return null;
  return Math.round((totalTokens / 1000) * rate);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}