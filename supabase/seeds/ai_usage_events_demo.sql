-- ============================================================================
-- DEMO SEED — ai_usage_events
--
-- Populates the table with ~80 realistic-looking AI call events distributed
-- across the last 30 days, so the super-admin AI Usage dashboard demonstrates
-- its populated state immediately instead of showing zeros.
--
-- Idempotent. Every row written here carries `metadata->>'_demo' = 'true'`
-- so the first statement can clean up its own prior insertions cleanly. Real
-- production events (written by the metering middleware) don't have that
-- marker and will never be touched.
--
-- To remove all demo rows later:
--   DELETE FROM public.ai_usage_events WHERE (metadata->>'_demo') = 'true';
--
-- Requires at least one row in public.workspaces. If you have none yet, sign
-- up via /auth → Create workspace first.
-- ============================================================================

-- 1. Clear any prior demo rows.
DELETE FROM public.ai_usage_events WHERE (metadata->>'_demo') = 'true';

-- 2. Insert 80 events. We use generate_series for the loop, modulo math for
--    distribution across services / models, and random() for timestamps,
--    latency, and token counts. Cost is computed from the rate table inline.
WITH
  -- Pull up to 5 workspaces. If you only have 1 or 2, the mod math below
  -- still works — events just concentrate on those tenants.
  ws AS (
    SELECT id, row_number() OVER (ORDER BY created_at ASC) - 1 AS idx
      FROM public.workspaces
     WHERE status = 'active'
     LIMIT 5
  ),
  ws_count AS (SELECT COUNT(*)::int AS n FROM ws),
  events AS (
    SELECT
      n,
      (SELECT id FROM ws WHERE idx = (n % (SELECT n FROM ws_count))) AS workspace_id,
      CASE n % 3
        WHEN 0 THEN 'chat'
        WHEN 1 THEN 'voice'
        ELSE        'vision'
      END                                                            AS service,
      'gemini'                                                       AS provider,
      CASE WHEN n % 7 = 0 THEN 'gemini-2.5-pro' ELSE 'gemini-2.5-flash' END AS model,
      -- 200..2000 input, 100..800 output
      (200 + (random() * 1800)::int)                                 AS input_tokens,
      (100 + (random() * 700)::int)                                  AS output_tokens,
      -- 300..3000ms latency
      (300 + (random() * 2700)::int)                                 AS latency_ms,
      CASE WHEN random() < 0.05 THEN 'error' ELSE 'success' END      AS status,
      -- Spread across last 30 days; recent days weighted slightly heavier.
      now() - (random() * interval '30 days')                        AS created_at
    FROM generate_series(1, 80) AS n
  )
INSERT INTO public.ai_usage_events (
  workspace_id, service, provider, model,
  input_tokens, output_tokens, total_tokens, latency_ms, cost_micro_inr,
  status, error_code, request_id, metadata, created_at
)
SELECT
  e.workspace_id,
  e.service,
  e.provider,
  e.model,
  e.input_tokens,
  e.output_tokens,
  e.input_tokens + e.output_tokens                                   AS total_tokens,
  e.latency_ms,
  -- Cost = (total_tokens / 1000) * micro-INR per 1k tokens
  -- Flash: 6,000 µINR/1k.  Pro: 60,000 µINR/1k.
  ((e.input_tokens + e.output_tokens) *
    CASE e.model
      WHEN 'gemini-2.5-pro' THEN 60000
      ELSE 6000
    END
  ) / 1000                                                           AS cost_micro_inr,
  e.status,
  CASE WHEN e.status = 'error' THEN 'rate_limit' ELSE NULL END       AS error_code,
  'demo_' || e.n::text                                               AS request_id,
  jsonb_build_object('_demo', 'true', 'seed_batch', 1)               AS metadata,
  e.created_at
FROM events e
-- Skip rows where we couldn't resolve a workspace (no workspaces existed).
WHERE e.workspace_id IS NOT NULL;

-- 3. Summary so you can verify in the SQL editor output pane.
SELECT
  COUNT(*)                                                  AS rows_inserted,
  COUNT(DISTINCT workspace_id)                              AS workspaces_touched,
  ROUND(SUM(cost_micro_inr)::numeric / 1000000, 2)          AS total_cost_inr,
  SUM(total_tokens)                                         AS total_tokens,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'success')
        / NULLIF(COUNT(*), 0), 1)                           AS success_rate_pct
FROM public.ai_usage_events
WHERE (metadata->>'_demo') = 'true';