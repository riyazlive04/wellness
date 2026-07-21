-- Client-facing product store.
--
-- A nutritionist sells things to their own clients (supplement packs, printed
-- meal plans, one-off consultations). Two tables, deliberately kept simpler than
-- a general e-commerce schema:
--
--   products        the workspace's catalog
--   product_orders  one purchase = one product x quantity (no cart)
--
-- Money is paise integers everywhere, matching payments.amount_paise — never
-- floats, so totals can't drift.
--
-- Payment follows the same rule as credit top-ups (see razorpay-webhook.service
-- .ts): checkout only creates a PENDING row; ONLY the webhook flips it to paid.
-- An abandoned Razorpay modal therefore can't hand out a product for free.

create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  created_by        uuid,
  name              text not null,
  description       text,
  -- physical ships, digital is a download/link, service is time (a consult).
  -- Kept as free text + check so adding a kind later is a one-line migration.
  kind              text not null default 'physical' check (kind in ('physical','digital','service')),
  price_paise       bigint not null check (price_paise >= 0),
  -- Optional strike-through "was" price. Null = no discount shown.
  compare_at_paise  bigint check (compare_at_paise is null or compare_at_paise >= 0),
  currency          text not null default 'INR',
  image_url         text,
  -- Clients only ever see 'published'. Archived keeps order history intact.
  status            text not null default 'draft' check (status in ('draft','published','archived')),
  -- Null = unlimited (the normal case for digital/service products).
  stock_quantity    integer check (stock_quantity is null or stock_quantity >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Hot read: the client storefront ("published products for my workspace").
create index if not exists products_workspace_status_idx
  on public.products (workspace_id, status);

create table if not exists public.product_orders (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  -- restrict, not cascade: deleting a product must not erase paid history.
  product_id          uuid not null references public.products(id) on delete restrict,
  client_id           uuid references public.clients(id) on delete set null,
  user_id             uuid,
  quantity            integer not null default 1 check (quantity > 0),
  -- Price snapshot at purchase time, so later catalog edits can't rewrite what
  -- the customer was actually charged.
  product_name        text not null,
  unit_price_paise    bigint not null check (unit_price_paise >= 0),
  amount_paise        bigint not null check (amount_paise >= 0),
  currency            text not null default 'INR',
  status              text not null default 'pending'
                        check (status in ('pending','paid','failed','cancelled','fulfilled')),
  razorpay_order_id   text,
  -- UNIQUE → Razorpay replays the same webhook; a replay can't double-fulfil.
  razorpay_payment_id text unique,
  notes               jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  paid_at             timestamptz,
  fulfilled_at        timestamptz
);

-- Owner's orders list, newest first.
create index if not exists product_orders_workspace_idx
  on public.product_orders (workspace_id, created_at desc);
-- Client's own purchase history.
create index if not exists product_orders_client_idx
  on public.product_orders (client_id, created_at desc);
-- Webhook lookup: payment.captured carries the razorpay order id.
create index if not exists product_orders_rzp_order_idx
  on public.product_orders (razorpay_order_id);

-- Backend reaches these through the postgres role (bypasses RLS). Enabling RLS
-- means the anon/authenticated Supabase keys can never read another workspace's
-- catalog or orders, or mark an order paid client-side.
alter table public.products       enable row level security;
alter table public.product_orders enable row level security;
