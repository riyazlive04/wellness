-- NUCLEAR RLS FIX V3 - Bypassing table-level checks with Security Definer
-- This version uses the robust functions we already established to ensure NO recursion or filtering issues.

-- 1. Ensure the helper function is perfectly robust
CREATE OR REPLACE FUNCTION public.check_is_privileged()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- This bypasses RLS on user_roles
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND (role::text = 'admin' OR role::text = 'manager')
  );
END;
$$;

-- 2. Drop and Recreate admin_requests policies using the function
DROP POLICY IF EXISTS "Admins and Managers full access" ON public.admin_requests;
DROP POLICY IF EXISTS "Admins and Managers can view all requests" ON public.admin_requests;

CREATE POLICY "Privileged access to admin_requests"
ON public.admin_requests
FOR ALL
TO authenticated
USING (
  public.check_is_privileged()
)
WITH CHECK (
  public.check_is_privileged()
);

-- 3. Ensure Client access is also robust
DROP POLICY IF EXISTS "Clients can insert own requests" ON public.admin_requests;
DROP POLICY IF EXISTS "Clients can view own requests" ON public.admin_requests;

CREATE POLICY "Client insert policy"
ON public.admin_requests
FOR INSERT
TO authenticated
WITH CHECK (
  -- Using a raw subquery on clients is usually safe as long as clients table RLS allows self-view
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = admin_requests.client_id
    AND clients.user_id::text = auth.uid()::text
  )
);

CREATE POLICY "Client select policy"
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

-- 4. ENSURE CLIENTS TABLE visibility for admins is also using the function
DROP POLICY IF EXISTS "Admins and Managers can view all clients_v2" ON public.clients;
CREATE POLICY "Privileged access to clients"
ON public.clients
FOR SELECT
TO authenticated
USING (
  public.check_is_privileged()
);

-- 5. Final Permission Check
GRANT EXECUTE ON FUNCTION public.check_is_privileged() TO authenticated;
GRANT ALL ON public.admin_requests TO authenticated;
GRANT ALL ON public.clients TO authenticated;
