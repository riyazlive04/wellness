-- Leads come in only through the backend (POST /api/v1/public/leads), which
-- runs phone/email OTP checks, validates input and books the demo slot.
-- The anon INSERT policy let anyone with the public Supabase key write rows
-- directly, skipping all of that (fake "phone verified" leads, squatted slots),
-- and the super-admin UPDATE policy let browser edits skip the API and the
-- audit log. Reads by super admins (the Leads page) are unchanged.
DROP POLICY IF EXISTS "landing form can insert leads" ON public.leads;
DROP POLICY IF EXISTS "super admins update leads" ON public.leads;
REVOKE INSERT, UPDATE, DELETE ON public.leads FROM anon, authenticated;
