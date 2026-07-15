-- One-time onboarding setup fee (2026 pricing sheet: ₹4,999 / ₹9,999 / ₹24,999).
--
-- The fee is charged as a Razorpay subscription ADD-ON, so it rides the first
-- invoice of the first subscription (one checkout, one charge) instead of a
-- separate order. This column is the idempotency marker: the add-on is only
-- attached when it is NULL, so cancelling and re-subscribing never re-charges.
--
-- NULL = not yet paid. Set when the first subscription payment is verified.

alter table public.workspaces
  add column if not exists setup_fee_paid_at timestamptz;

comment on column public.workspaces.setup_fee_paid_at is
  'When the one-time onboarding setup fee was charged. NULL = unpaid; guards against re-charging on re-subscribe.';
