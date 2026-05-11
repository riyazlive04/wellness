-- Nuclear Fix for User Roles Recursion
-- 1. Drop EVERYTHING related to user_roles policies to ensure clean slate
DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins and Managers can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins and Managers can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles; 

-- 2. Define the Safe Permission Check Function
CREATE OR REPLACE FUNCTION public.check_permissions_safe()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_exists BOOLEAN;
BEGIN
  -- Set the recursion breaking flag
  -- We use 't' to mimic boolean true in text
  PERFORM set_config('app.checking_role', 'true', true);
  
  -- Check if user is Admin or Manager
  -- Explicit casting for safety
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND (role::text = 'admin' OR role::text = 'manager')
  ) INTO role_exists;
  
  RETURN role_exists;
END;
$$;

-- 3. Define Standard is_admin Function (Safety Wrapper)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_adm BOOLEAN;
BEGIN
  PERFORM set_config('app.checking_role', 'true', true);
  
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND role::text = 'admin'
  ) INTO is_adm;
  
  RETURN is_adm;
END;
$$;

-- 4. Apply Minimal, Robust Policies

-- Policy A: Allow users to read their OWN role always
-- This is non-recursive because it depends only on auth.uid()
CREATE POLICY "Users can read own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id::text = auth.uid()::text
);

-- Policy B: Allow Admins/Managers to read ALL roles
-- This includes the recursion breaker
CREATE POLICY "Admins and Managers can read all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  -- Recursion Breaker:
  -- If 'app.checking_role' is 'true', we allow access (to facilitate the internal check)
  COALESCE(current_setting('app.checking_role', true), 'false') = 'true'
  OR
  public.check_permissions_safe()
);

-- 5. Grant Permissions
GRANT EXECUTE ON FUNCTION public.check_permissions_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

-- 6. Ensure RLS is enabled
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
