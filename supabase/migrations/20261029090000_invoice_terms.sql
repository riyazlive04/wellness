-- Terms and conditions on a practice's invoices.
--
-- Two levels, because practices asked for both and they answer different
-- questions:
--   workspaces.invoice_terms   - the practice's standard terms, typed once
--   practice_invoices.terms    - what THIS invoice actually carried
--
-- The per-invoice copy is not redundant. An issued invoice is a record of
-- what was agreed at the time, so editing the practice default must not
-- rewrite the terms on invoices already sent. The invoice keeps its own copy
-- from the moment it is created.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS invoice_terms text;

ALTER TABLE public.practice_invoices
  ADD COLUMN IF NOT EXISTS terms text;

COMMENT ON COLUMN public.workspaces.invoice_terms IS
  'The practice''s default invoice terms, copied onto each new invoice.';
COMMENT ON COLUMN public.practice_invoices.terms IS
  'Terms as they stood when this invoice was raised - never back-filled from the practice default.';
