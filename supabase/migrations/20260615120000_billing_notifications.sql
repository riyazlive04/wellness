-- Billing notifications (Module 3 — Notification System).
--
-- Workspace-scoped, in-app billing events: subscription activation, renewal
-- reminders, payment success/failure, trial expiry, invoice availability, and
-- dunning/recovery notices. Emitted by the Razorpay webhook, the billing
-- scheduler (cron), and invoice generation. Surfaced on the owner Billing page.
--
-- `dedupe_key` makes cron-emitted notifications idempotent: a partial unique
-- index on (workspace_id, dedupe_key) means re-running a daily job (e.g. the
-- "renewal in 3 days" reminder for the same period) is a safe no-op.

CREATE TABLE IF NOT EXISTS public.billing_notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type         text        NOT NULL,
  severity     text        NOT NULL DEFAULT 'info',   -- info | success | warning | critical
  title        text        NOT NULL,
  body         text        NOT NULL DEFAULT '',
  action_url   text,
  dedupe_key   text,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_notifications_workspace_created_idx
  ON public.billing_notifications (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS billing_notifications_workspace_unread_idx
  ON public.billing_notifications (workspace_id)
  WHERE read_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_notifications_dedupe_idx
  ON public.billing_notifications (workspace_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
