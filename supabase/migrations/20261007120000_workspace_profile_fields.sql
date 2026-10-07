-- Fields the workspace setup flow collects but had nowhere to keep.
-- specializations: what the practice focuses on (public page, matching later)
-- state + pincode: business address; GST invoices need the state to decide
-- CGST+SGST (same state) vs IGST (other state).
alter table public.workspaces
  add column if not exists specializations text[] not null default '{}',
  add column if not exists state text,
  add column if not exists pincode text;
