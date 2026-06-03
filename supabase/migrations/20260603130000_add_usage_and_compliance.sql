-- ============================================================================
-- SIRAH LIFE — AI usage metering + compliance tables.
--
--   1. ai_usage_events     — one row per Gemini/Claude/etc. call
--   2. deletion_requests   — DPDP-compliant right-to-erasure queue
--   3. usage_quotas (view) — convenience aggregate, not a real table
--
-- Both tables are platform-readable, tenant-scoped.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ai_usage_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  service           text NOT NULL,         -- 'chat' | 'voice' | 'vision'
  provider          text NOT NULL,         -- 'gemini' | 'claude' | 'openai' | ...
  model             text,                  -- 'gemini-2.5-flash', etc.
  input_tokens      integer,
  output_tokens     integer,
  total_tokens      integer,
  latency_ms        integer,
  -- Cost in micro-rupees (1 INR = 1,000,000) to keep sub-paise precision.
  cost_micro_inr    bigint,
  status            text NOT NULL,         -- 'success' | 'error'
  error_code        text,
  request_id        text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_workspace_idx ON public.ai_usage_events(workspace_id);
CREATE INDEX IF NOT EXISTS ai_usage_events_service_idx   ON public.ai_usage_events(service);
CREATE INDEX IF NOT EXISTS ai_usage_events_provider_idx  ON public.ai_usage_events(provider);
CREATE INDEX IF NOT EXISTS ai_usage_events_created_idx   ON public.ai_usage_events(created_at DESC);
-- Composite for "what did workspace X spend this month" queries
CREATE INDEX IF NOT EXISTS ai_usage_events_workspace_created_idx
  ON public.ai_usage_events(workspace_id, created_at DESC);

COMMENT ON TABLE public.ai_usage_events IS
  'Per-call AI usage ledger. cost_micro_inr is micro-rupees (1 INR = 1e6 µINR).';

-- ---------------------------------------------------------------------------
-- 2. deletion_requests — DPDP/GDPR right-to-erasure tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Who's being erased (auth.users id) and which tenant they belong to
  target_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email      text NOT NULL,
  workspace_id      uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  -- Who asked. May be the user themselves (self-serve) or a workspace admin.
  requested_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_by_email text,
  request_channel   text NOT NULL DEFAULT 'support',  -- 'support'|'self'|'admin'
  reason            text,
  -- Status: pending → in_review → completed | rejected
  status            text NOT NULL DEFAULT 'pending',
  -- Who handled it
  processed_at      timestamptz,
  processed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  processing_notes  text,
  -- SLA: DPDP gives 7 working days; configurable platform-wide.
  due_by            timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deletion_requests_status_idx     ON public.deletion_requests(status);
CREATE INDEX IF NOT EXISTS deletion_requests_due_by_idx     ON public.deletion_requests(due_by);
CREATE INDEX IF NOT EXISTS deletion_requests_created_idx    ON public.deletion_requests(created_at DESC);

COMMENT ON TABLE public.deletion_requests IS
  'DPDP Act right-to-erasure queue. SLA defaults to 7 days; super admins resolve.';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'deletion_requests_set_updated_at') THEN
    CREATE TRIGGER deletion_requests_set_updated_at
      BEFORE UPDATE ON public.deletion_requests
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- RLS — backend uses service_role.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_usage_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deletion_requests  ENABLE ROW LEVEL SECURITY;

-- No policies = locked down for anon/authenticated. service_role bypasses RLS.