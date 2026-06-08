-- ============================================================================
-- DEMO SEED — Razorpay billing (subscriptions / payments / invoices)
--
-- Populates the billing tables with ~3 months of realistic activity for the
-- first 5 active workspaces. After running this, the super-admin Revenue,
-- Subscriptions, and Billing dashboards demonstrate their populated state
-- instead of showing zeros.
--
-- Same idempotency pattern as ai_usage_events_demo.sql:
--   - Every row tagged metadata->>'_demo' = 'true'
--   - First three statements delete any prior demo rows (in reverse FK order)
--   - Real webhook-written rows never carry the marker and are untouched
--
-- To remove all demo billing rows later:
--   DELETE FROM public.invoices      WHERE (metadata->>'_demo') = 'true';
--   DELETE FROM public.payments      WHERE (metadata->>'_demo') = 'true';
--   DELETE FROM public.subscriptions WHERE (metadata->>'_demo') = 'true';
--
-- Prerequisite: migration 20260603120000_add_billing_tables.sql must be
-- applied. If you see "relation public.payments does not exist", run that
-- migration first.
-- ============================================================================

-- Clean prior demo rows (reverse FK order: invoices → payments → subs)
DELETE FROM public.invoices      WHERE (metadata->>'_demo') = 'true';
DELETE FROM public.payments      WHERE (metadata->>'_demo') = 'true';
DELETE FROM public.subscriptions WHERE (metadata->>'_demo') = 'true';

-- ---------------------------------------------------------------------------
-- 1. SUBSCRIPTIONS — one active subscription per workspace
--    Plan rotation across 5 workspaces: 2 starter, 2 pro, 1 scale.
--    Realistic MRR mix for a young SaaS.
-- ---------------------------------------------------------------------------
INSERT INTO public.subscriptions (
  workspace_id, plan_key, status,
  current_period_start, current_period_end,
  amount_paise, currency,
  started_at, metadata
)
SELECT
  w.id,
  CASE (row_number() OVER (ORDER BY w.created_at) - 1) % 5
    WHEN 0 THEN 'starter'
    WHEN 1 THEN 'pro'
    WHEN 2 THEN 'starter'
    WHEN 3 THEN 'pro'
    ELSE        'scale'
  END,
  'active',
  date_trunc('month', now()),
  date_trunc('month', now()) + interval '1 month',
  CASE (row_number() OVER (ORDER BY w.created_at) - 1) % 5
    WHEN 0 THEN 99900    -- starter   = ₹999
    WHEN 1 THEN 199900   -- pro       = ₹1,999
    WHEN 2 THEN 99900
    WHEN 3 THEN 199900
    ELSE        299900   -- scale     = ₹2,999
  END,
  'INR',
  -- Started 3-6 months ago; staggered so subscriptions feel like a real funnel
  now() - (interval '1 month' * (3 + ((row_number() OVER (ORDER BY w.created_at) - 1) % 4))),
  jsonb_build_object('_demo', 'true')
FROM public.workspaces w
WHERE w.status = 'active'
ORDER BY w.created_at
LIMIT 5;

-- ---------------------------------------------------------------------------
-- 2. PAYMENTS — captured payments for the last 3 months per subscription
--    Methods rotated for realism (card / upi / netbanking).
-- ---------------------------------------------------------------------------
INSERT INTO public.payments (
  workspace_id, subscription_id,
  amount_paise, currency, status, method,
  captured_at, metadata
)
SELECT
  s.workspace_id,
  s.id,
  s.amount_paise,
  s.currency,
  'captured',
  CASE n % 3 WHEN 0 THEN 'card' WHEN 1 THEN 'upi' ELSE 'netbanking' END,
  -- Captures land a few days into each month
  date_trunc('month', now()) - (interval '1 month' * n) + interval '3 days',
  jsonb_build_object('_demo', 'true')
FROM public.subscriptions s
CROSS JOIN generate_series(0, 2) AS n   -- this month + 2 prior months
WHERE (s.metadata->>'_demo') = 'true';

-- ---------------------------------------------------------------------------
-- 3. FAILED PAYMENTS — a couple for the dunning queue card
-- ---------------------------------------------------------------------------
INSERT INTO public.payments (
  workspace_id, subscription_id,
  amount_paise, currency, status, method,
  error_code, error_description,
  failed_at, metadata
)
SELECT
  s.workspace_id,
  s.id,
  s.amount_paise,
  s.currency,
  'failed',
  'card',
  'BAD_REQUEST_ERROR',
  'Card declined by issuer',
  now() - (interval '1 day' * (row_number() OVER (ORDER BY s.id))),
  jsonb_build_object('_demo', 'true')
FROM public.subscriptions s
WHERE (s.metadata->>'_demo') = 'true'
LIMIT 2;

-- ---------------------------------------------------------------------------
-- 4. INVOICES — one per captured payment, with 18% GST extracted from gross
--    (GST = amount * 18 / 118 because subscription prices include tax)
-- ---------------------------------------------------------------------------
INSERT INTO public.invoices (
  workspace_id, subscription_id, payment_id, invoice_number,
  amount_paise, gst_amount_paise, status, currency,
  period_start, period_end, issued_at, paid_at,
  customer_name, customer_email, metadata
)
SELECT
  p.workspace_id,
  p.subscription_id,
  p.id,
  'INV-' || to_char(p.captured_at, 'YYMM') || '-' || substring(replace(p.id::text, '-', ''), 1, 6),
  p.amount_paise,
  (p.amount_paise * 18) / 118,
  'paid',
  p.currency,
  date_trunc('month', p.captured_at),
  date_trunc('month', p.captured_at) + interval '1 month',
  p.captured_at,
  p.captured_at,
  w.name,
  w.contact_email,
  jsonb_build_object('_demo', 'true')
FROM public.payments p
JOIN public.workspaces w ON w.id = p.workspace_id
WHERE (p.metadata->>'_demo') = 'true' AND p.status = 'captured';

-- ---------------------------------------------------------------------------
-- 5. Verification — peek at what landed so you can confirm in the editor
-- ---------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM public.subscriptions WHERE (metadata->>'_demo') = 'true')               AS subscriptions,
  (SELECT COUNT(*) FROM public.payments      WHERE (metadata->>'_demo') = 'true')               AS payments,
  (SELECT COUNT(*) FROM public.payments      WHERE (metadata->>'_demo') = 'true' AND status = 'failed') AS failed_payments,
  (SELECT COUNT(*) FROM public.invoices      WHERE (metadata->>'_demo') = 'true')               AS invoices,
  (SELECT ROUND(SUM(amount_paise)::numeric / 100, 2)
     FROM public.payments
    WHERE (metadata->>'_demo') = 'true' AND status = 'captured')                                AS total_captured_inr,
  (SELECT ROUND(SUM(amount_paise)::numeric / 100, 2)
     FROM public.subscriptions
    WHERE (metadata->>'_demo') = 'true' AND status = 'active')                                  AS mrr_inr;