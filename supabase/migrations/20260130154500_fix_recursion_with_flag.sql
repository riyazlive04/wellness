-- Fix Infinite Recursion using Session Variables
-- We use a session variable 'app.checking_role' to detect if we are inside a role check
-- avoiding the infinite loop of Policy -> Function -> Policy.

-- 1. Helper Function to safely check role without recursion
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
  -- 't' is the value, true means "is_local" (transaction scoped)
  PERFORM set_config('app.checking_role', 'true', true);
  
  -- Perform the check
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND (role::text = 'admin' OR role::text = 'manager')
  ) INTO is_privileged;
  
  -- Clear the flag (optional since it's local, but good practice)
  -- Actually, we rely on it being set during the query.
  -- The query is done now.
  
  RETURN is_privileged;
END;
$$;

-- 2. Update user_roles Policies
-- We need to check the flag in the policy definition.
-- If 'app.checking_role' is 'true', we SKIP the recursive check (return false from this policy).
-- The "Self View" policy will still return true for the user's own row, allowing the function to succeed.

DROP POLICY IF EXISTS "Admins and Managers can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;

CREATE POLICY "Admins and Managers can read all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  -- Recursion Breaker: If we are already checking, don't recurse.
  (current_setting('app.checking_role', true) IS DISTINCT FROM 'true')
  AND
  public.check_is_admin_or_manager_safe()
);

-- Ensure Self View gives access for the internal check
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
CREATE POLICY "Users can read own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id::text = auth.uid()::text
);

-- 3. Update generic is_admin too just in case
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
