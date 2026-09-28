-- Setup fees actually paid, one row per subscription whose first charge
-- included one. The fee due on a new subscription is that plan's fee minus
-- what the workspace has already paid, so Starter -> Growth pays only the
-- difference (it used to pay nothing: a single setup_fee_paid_at stamp meant
-- "paid", whatever the amount).
--
-- The primary key makes recording idempotent: the browser's verify call and
-- the Razorpay webhook can both record the same payment.

create table if not exists public.workspace_setup_fee_payments (
  razorpay_subscription_id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_key     text not null,
  amount_inr   integer not null check (amount_inr > 0),
  paid_at      timestamptz not null default now()
);

create index if not exists workspace_setup_fee_payments_ws_idx
  on public.workspace_setup_fee_payments (workspace_id);

alter table public.workspace_setup_fee_payments enable row level security;
