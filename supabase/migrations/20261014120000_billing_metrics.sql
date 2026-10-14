-- Revenue metrics that match the money (super admin audit, batch 2).
--
-- subscriptions.billing_cycle: 'monthly' | 'annual'. MRR used to add up the
--   stored price as if every plan were monthly, so a yearly plan counted ~10x.
-- subscriptions.is_test: the ₹1 test coupon (NUSI_TEST_COUPON). Those are
--   real 'active' subscriptions but not revenue.
-- workspaces.billing_exempt: NUSI's own and complimentary practices; kept out
--   of revenue, conversion and trial metrics.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle text,
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

UPDATE public.subscriptions
   SET billing_cycle = COALESCE(metadata->'notes'->>'billing_cycle', metadata->>'billing_cycle', 'monthly')
 WHERE billing_cycle IS NULL;

UPDATE public.subscriptions
   SET is_test = true
 WHERE NOT is_test
   AND (metadata ? 'coupon' OR (metadata->'notes') ? 'coupon' OR amount_paise = 100);

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS billing_exempt boolean NOT NULL DEFAULT false;

-- Complimentary (Sirah Nutrition, Demo Practice, Salman Nutritionist) and
-- NUSI's own test practice (Sirah Digital Nutritionist).
UPDATE public.workspaces
   SET billing_exempt = true
 WHERE id IN (
   '297eb44f-2d85-49cc-81b1-d6bf05b958ce',
   'a580fbec-9c42-42b0-a26e-27d27679a799',
   'bc534a80-dc00-4dd2-ab5e-36907742cab0',
   '78d5c2c0-1d70-412e-b81a-47032001a131'
 );
