-- Purchased AI credit packs (pricing sheet: 1,000 / 5,000 / 20,000 credits).
--
-- Context: 1 credit = 1 AI call. The monthly allowance comes from the plan
-- (limits.aiCallsPerMonth) and consumption is counted from ai_usage_events.
-- Before this table, buying a credit pack charged the customer but granted
-- NOTHING — there was nowhere to record it and no code to apply it.
--
-- A grant lifts the allowance for the CYCLE IT WAS BOUGHT IN (matching the
-- top-up copy: "Top up your AI quota for the current billing cycle"), i.e.
--   effective allowance = plan.aiCallsPerMonth + SUM(credits granted this month)
--
-- payment_id is UNIQUE: Razorpay may replay a webhook, and a double-grant would
-- hand out credits that were never paid for.

create table if not exists public.workspace_credit_grants (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  -- Credits granted (= AI calls). Always positive.
  credits      integer not null check (credits > 0),
  -- Catalog key the grant came from (e.g. ai_credits_5k). Audit only.
  topup_key    text,
  -- Razorpay payment id. UNIQUE → replay-safe, exactly-once granting.
  payment_id   text unique,
  granted_at   timestamptz not null default now()
);

-- The hot read: "how many bonus credits does this workspace have this cycle?"
create index if not exists workspace_credit_grants_ws_granted_idx
  on public.workspace_credit_grants (workspace_id, granted_at desc);

-- Backend reads/writes via the postgres role (bypasses RLS); enable RLS so the
-- anon/authenticated Supabase keys can never mint credits directly.
alter table public.workspace_credit_grants enable row level security;
