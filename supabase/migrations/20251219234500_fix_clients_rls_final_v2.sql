-- Final RLS Fix for Clients Table
-- Ensures Admins can manage all clients and Users can manage their own profile.

-- 1. Ensure is_admin() is robust (already done in recent migration, but re-affirming here for safety)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_roles.user_id::text = auth.uid()::text
    AND role::text = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Clean up existing policies on clients table
DROP POLICY IF EXISTS "Admins can manage all clients" ON public.clients;
DROP POLICY IF EXISTS "Users can view own client record" ON public.clients;
DROP POLICY IF EXISTS "Users can update own client record" ON public.clients;
DROP POLICY IF EXISTS "Users can read own client profile" ON public.clients;
DROP POLICY IF EXISTS "Users can update own client profile" ON public.clients;
DROP POLICY IF EXISTS "Clients can insert their own data" ON public.clients;
DROP POLICY IF EXISTS "Clients can update their own data" ON public.clients;
DROP POLICY IF EXISTS "Clients can view their own data" ON public.clients;

-- 3. Create explicit, clean policies

-- SELECT
CREATE POLICY "Enable select for own record or admins"
ON public.clients
FOR SELECT
USING (
  (auth.uid()::text = user_id::text)
  OR public.is_admin()
);

-- INSERT
CREATE POLICY "Enable insert for own record or admins"
ON public.clients
FOR INSERT
WITH CHECK (
  (auth.uid()::text = user_id::text)
  OR public.is_admin()
);

-- UPDATE
CREATE POLICY "Enable update for own record or admins"
ON public.clients
FOR UPDATE
USING (
  (auth.uid()::text = user_id::text)
  OR public.is_admin()
)
WITH CHECK (
  (auth.uid()::text = user_id::text)
  OR public.is_admin()
);

-- DELETE
CREATE POLICY "Enable delete for admins"
ON public.clients
FOR DELETE
USING (public.is_admin());

-- 4. Re-grant permissions
GRANT ALL ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
