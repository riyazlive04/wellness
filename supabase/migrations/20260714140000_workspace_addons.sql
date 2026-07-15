-- Recurring add-ons (pricing sheet: "Powerful add-ons — pay only for what you need").
--
-- Distinct from workspace_credit_grants (one-time credit packs): these RECUR
-- monthly and each is its own Razorpay subscription, so a customer can cancel an
-- add-on without touching their base plan.
--
-- Effective quotas become: plan limits + SUM(active add-on grants), resolved in
-- LimitsService.effectiveLimits(). A row here only means anything because that
-- resolver reads it — see backend/src/billing/addons.ts.
--
-- One row per (workspace, addon): buying 3 extra seats sets quantity = 3 rather
-- than inserting 3 rows, so the grant maths stays a simple multiply and the
-- Razorpay subscription quantity maps 1:1.

create table if not exists public.workspace_addons (
  id                       uuid primary key default gen_random_uuid(),
  workspace_id             uuid not null,
  -- Catalog key from billing/addons.ts (e.g. extra_team_member).
  addon_key                text not null,
  quantity                 integer not null default 1 check (quantity > 0),
  -- 'active' grants; anything else (cancelled/halted) grants nothing.
  status                   text not null default 'active',
  -- The add-on's own Razorpay subscription. UNIQUE → webhook replays are safe.
  razorpay_subscription_id text unique,
  current_period_end       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint workspace_addons_ws_key_uniq unique (workspace_id, addon_key)
);

-- Hot read: "what add-ons are active for this workspace?" (every limit check).
create index if not exists workspace_addons_ws_status_idx
  on public.workspace_addons (workspace_id, status);

-- Backend accesses this via the postgres role (bypasses RLS); enable RLS so the
-- anon/authenticated Supabase keys can never grant themselves quota.
alter table public.workspace_addons enable row level security;
