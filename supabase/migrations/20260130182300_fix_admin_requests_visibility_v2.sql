-- FORCE CLEAN SLATE FOR admin_requests RLS
-- This migration drops ALL possible policies and applies a robust version

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'admin_requests'
  LOOP
    EXECUTE 'DROP POLICY "' || r.policyname || '" ON public.admin_requests';
  END LOOP;
END $$;

-- Enable RLS
ALTER TABLE public.admin_requests ENABLE ROW LEVEL SECURITY;

-- 1. Admin/Manager: Full access to everything
CREATE POLICY "Admins and Managers full access"
ON public.admin_requests
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND role::text IN ('admin', 'manager')
  )
);

-- 2. Clients: Insert own requests
CREATE POLICY "Clients can insert own requests"
ON public.admin_requests
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = admin_requests.client_id
    AND clients.user_id::text = auth.uid()::text
  )
);

-- 3. Clients: View own requests
CREATE POLICY "Clients can view own requests"
ON public.admin_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = admin_requests.client_id
    AND clients.user_id::text = auth.uid()::text
  )
);

-- Grant permissions explicitly
GRANT ALL ON public.admin_requests TO authenticated;
GRANT ALL ON public.admin_requests TO service_role;
GRANT ALL ON public.admin_requests TO postgres;

-- Also double check clients table RLS just in case the join is failing there
DROP POLICY IF EXISTS "Admins and Managers can view all clients" ON public.clients;
CREATE POLICY "Admins and Managers can view all clients_v2"
ON public.clients
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND role::text IN ('admin', 'manager')
  )
);
