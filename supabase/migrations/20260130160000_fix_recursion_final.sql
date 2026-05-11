-- Final Fix for RLS Recursion
-- We use the session flag to ALLOW access during the check, breaking the loop.

-- 1. Ensure the Guard/Safe function exists and is correct
CREATE OR REPLACE FUNCTION public.check_is_admin_or_manager_safe()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged BOOLEAN;
BEGIN
  -- Set flag to indicate we are checking permissions
  PERFORM set_config('app.checking_role', 'true', true);
  
  -- Perform the check
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND (role::text = 'admin' OR role::text = 'manager')
  ) INTO is_privileged;
  
  -- Flag automatically clears at end of transaction, but we can rely on it being present during the select
  RETURN is_privileged;
END;
$$;

-- 2. Update user_roles Recursive Policy
DROP POLICY IF EXISTS "Admins and Managers can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;

CREATE POLICY "Admins and Managers can read all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  -- IF we are currently inside the check function (flag is true), ALLOW access immediately.
  -- ELSE, call the check function (which will set the flag and recurse once, then succeed).
  current_setting('app.checking_role', true) = 'true'
  OR
  public.check_is_admin_or_manager_safe()
);

-- 3. Ensure generic is_admin uses the same safe pattern or uses the safe check
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

GRANT EXECUTE ON FUNCTION public.check_is_admin_or_manager_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
