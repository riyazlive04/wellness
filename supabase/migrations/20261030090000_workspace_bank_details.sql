-- Bank details for a practice's own invoices.
--
-- Where terms are an agreement, these are the instructions a client needs to
-- actually pay: the account to transfer to, or the UPI ID to scan. Typed once
-- in Settings, printed on every invoice the practice issues.
--
-- Unlike invoice_terms there is no per-invoice copy. Terms are a record of
-- what was agreed when the invoice was raised, but bank details are a way to
-- reach the practice today - an invoice still outstanding after the practice
-- changed banks should show the account that works now, not the closed one.
--
-- All nullable: a practice that takes cash in the clinic fills in none of
-- these, and the invoice simply omits the block.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS bank_account_name   text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_name           text,
  ADD COLUMN IF NOT EXISTS bank_branch         text,
  ADD COLUMN IF NOT EXISTS bank_ifsc           text,
  ADD COLUMN IF NOT EXISTS bank_upi_id         text;

COMMENT ON COLUMN public.workspaces.bank_account_name IS
  'Name the account is held in - the beneficiary a client types when transferring.';
COMMENT ON COLUMN public.workspaces.bank_account_number IS
  'Stored exactly as entered. Indian account numbers vary by bank (9-18 digits), so no format is imposed.';
COMMENT ON COLUMN public.workspaces.bank_name IS
  'Bank, e.g. "HDFC Bank".';
COMMENT ON COLUMN public.workspaces.bank_branch IS
  'Branch, e.g. "Koramangala, Bengaluru".';
COMMENT ON COLUMN public.workspaces.bank_ifsc IS
  'IFSC, shape-validated only (AAAA0XXXXXX); never reformatted.';
COMMENT ON COLUMN public.workspaces.bank_upi_id IS
  'UPI VPA, e.g. "practice@okhdfcbank" - usually the fastest way a client pays.';
