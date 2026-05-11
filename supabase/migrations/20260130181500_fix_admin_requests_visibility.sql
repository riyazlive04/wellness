-- Fix RLS for admin_requests to ensure visibility for both Admins and Managers
-- And avoid recursion issues

-- 1. Drop existing policies on admin_requests
DROP POLICY IF EXISTS "Admins can view all requests" ON public.admin_requests;
DROP POLICY IF EXISTS "Admins can update requests" ON public.admin_requests;
DROP POLICY IF EXISTS "Admins can delete requests" ON public.admin_requests;
DROP POLICY IF EXISTS "Clients can create requests" ON public.admin_requests;
DROP POLICY IF EXISTS "Clients can view own requests" ON public.admin_requests;

-- 2. Create broader VIEW policy for Admin/Manager
-- Note: Using the explicit role check to be absolutely safe from recursion if functions are broken
CREATE POLICY "Admins and Managers can view all requests"
ON public.admin_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND role::text IN ('admin', 'manager')
  )
);

-- 3. Create UPDATE policy for Admin/Manager
CREATE POLICY "Admins and Managers can update requests"
ON public.admin_requests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND role::text IN ('admin', 'manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND role::text IN ('admin', 'manager')
  )
);

-- 4. Create INSERT policy for Clients (Robust)
CREATE POLICY "Clients can create requests"
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

-- 5. Create VIEW policy for Clients
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

-- 6. Add DELETE policy for Admins
CREATE POLICY "Admins can delete requests"
ON public.admin_requests
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND role::text = 'admin'
  )
);

-- 7. Grant permissions
GRANT ALL ON public.admin_requests TO authenticated;
GRANT ALL ON public.admin_requests TO service_role;
