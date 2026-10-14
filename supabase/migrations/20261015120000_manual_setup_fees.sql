-- Setup fees paid outside Razorpay (UPI, bank transfer, cash), recorded by a
-- super admin. They go in the same table as Razorpay-charged fees so the
-- "fee due" maths counts them: a practice that paid Starter's fee by UPI is
-- not charged it again when it later subscribes through Razorpay.
--
-- Manual rows use razorpay_subscription_id = 'manual:<uuid>' as their key.

alter table public.workspace_setup_fee_payments
  add column if not exists method      text,
  add column if not exists reference   text,
  add column if not exists recorded_by uuid;

comment on column public.workspace_setup_fee_payments.method is
  'NULL = charged through Razorpay. Otherwise how it was paid by hand: upi, bank, cash, other.';
