-- ============================================================================
-- SIRAH LIFE — Razorpay billing tables.
--
-- Four tables that hold everything we need to render Revenue / Subscriptions /
-- Billing in the super-admin dashboard:
--   1. subscriptions    — one row per active/past workspace subscription
--   2. payments         — every successful or failed charge
--   3. invoices         — GST-bearing invoice metadata, links to payment(s)
--   4. webhook_events   — append-only event ledger, idempotency anchor
--
-- All four are platform-level reads (super_admin), but every row carries a
-- workspace_id so we can slice by tenant. RLS is permissive for service_role
-- and locked down for everyone else — backend uses service_role.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Razorpay handles
  razorpay_subscription_id  text UNIQUE,
  razorpay_plan_id          text,
  razorpay_customer_id      text,
  -- Plan we mapped to (matches platform_config.plans[].id — e.g. 'starter')
  plan_key                  text NOT NULL,
  -- Status follows Razorpay's vocabulary: created, authenticated, active,
  -- pending, halted, cancelled, completed, expired, paused
  status                    text NOT NULL DEFAULT 'created',
  -- Period
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  trial_ends_at             timestamptz,
  -- Money snapshot at last sync (in paise — Razorpay's unit)
  amount_paise              bigint,
  currency                  text NOT NULL DEFAULT 'INR',
  -- Lifecycle
  started_at                timestamptz,
  cancelled_at              timestamptz,
  cancel_reason             text,
  ended_at                  timestamptz,
  -- Free-form metadata (Razorpay's response, our notes, etc.)
  metadata                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_workspace_idx ON public.subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx    ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS subscriptions_plan_idx      ON public.subscriptions(plan_key);
CREATE INDEX IF NOT EXISTS subscriptions_period_end_idx ON public.subscriptions(current_period_end);

COMMENT ON TABLE public.subscriptions IS
  'One row per Razorpay subscription. Updated by webhook handlers. Read by /api/v1/admin/billing/*';

-- ---------------------------------------------------------------------------
-- 2. payments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subscription_id       uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  -- Razorpay handles
  razorpay_payment_id   text UNIQUE,
  razorpay_order_id     text,
  razorpay_invoice_id   text,
  -- Money (paise)
  amount_paise          bigint NOT NULL,
  amount_refunded_paise bigint NOT NULL DEFAULT 0,
  currency              text NOT NULL DEFAULT 'INR',
  -- Razorpay statuses: created, authorized, captured, refunded, failed
  status                text NOT NULL,
  method                text,     -- 'card' | 'upi' | 'netbanking' | 'wallet' | ...
  description           text,
  email                 text,
  contact               text,
  -- Failure / dispute
  error_code            text,
  error_description     text,
  -- When
  captured_at           timestamptz,
  failed_at             timestamptz,
  -- Free-form
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_workspace_idx     ON public.payments(workspace_id);
CREATE INDEX IF NOT EXISTS payments_subscription_idx  ON public.payments(subscription_id);
CREATE INDEX IF NOT EXISTS payments_status_idx        ON public.payments(status);
CREATE INDEX IF NOT EXISTS payments_captured_at_idx   ON public.payments(captured_at DESC);

COMMENT ON TABLE public.payments IS
  'Every Razorpay charge. status=captured contributes to revenue; status=failed feeds the dunning queue.';

-- ---------------------------------------------------------------------------
-- 3. invoices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subscription_id       uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  payment_id            uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  -- Razorpay handle
  razorpay_invoice_id   text UNIQUE,
  invoice_number        text,
  -- Money (paise)
  amount_paise          bigint NOT NULL,
  gst_amount_paise      bigint NOT NULL DEFAULT 0,
  -- Razorpay statuses: draft, issued, partially_paid, paid, cancelled, expired
  status                text NOT NULL,
  currency              text NOT NULL DEFAULT 'INR',
  -- Period this invoice covers
  period_start          timestamptz,
  period_end            timestamptz,
  due_at                timestamptz,
  issued_at             timestamptz,
  paid_at               timestamptz,
  -- Customer snapshot (denormalised so deleting the workspace doesn't lose history)
  customer_name         text,
  customer_email        text,
  customer_gstin        text,
  -- Document
  pdf_url               text,
  -- Free-form
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_workspace_idx    ON public.invoices(workspace_id);
CREATE INDEX IF NOT EXISTS invoices_subscription_idx ON public.invoices(subscription_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx       ON public.invoices(status);
CREATE INDEX IF NOT EXISTS invoices_issued_at_idx    ON public.invoices(issued_at DESC);

COMMENT ON TABLE public.invoices IS
  'GST-bearing invoice metadata. pdf_url points at Razorpay-hosted document.';

-- ---------------------------------------------------------------------------
-- 4. webhook_events — idempotency + audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source                text NOT NULL DEFAULT 'razorpay',
  -- Razorpay sends `x-razorpay-event-id` header — we use that for dedup
  external_event_id     text NOT NULL,
  event_type            text NOT NULL,
  payload               jsonb NOT NULL,
  signature_valid       boolean NOT NULL,
  processed_at          timestamptz,
  error                 text,
  received_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_event_id)
);

CREATE INDEX IF NOT EXISTS webhook_events_received_idx ON public.webhook_events(received_at DESC);
CREATE INDEX IF NOT EXISTS webhook_events_type_idx     ON public.webhook_events(event_type);
CREATE INDEX IF NOT EXISTS webhook_events_unprocessed_idx
  ON public.webhook_events(received_at) WHERE processed_at IS NULL;

COMMENT ON TABLE public.webhook_events IS
  'Append-only ledger of provider webhooks. Unique (source, external_event_id) prevents double-processing.';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'subscriptions_set_updated_at') THEN
    CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'payments_set_updated_at') THEN
    CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'invoices_set_updated_at') THEN
    CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- RLS — backend uses service_role which bypasses RLS, but we still want to
-- deny direct anon/authenticated access in case anyone hits Supabase rest.
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events   ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies = no access for anon/authenticated.
-- service_role bypasses RLS so the backend can do everything it needs.