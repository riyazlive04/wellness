-- Fix Infinite Recursion in user_roles Policies
-- The issue is likely that role-check functions were triggering RLS on user_roles again.
-- We ensure functions are SECURITY DEFINER (bypassing RLS) and simple.

-- 1. Fix is_admin (used by user_roles policy)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Perform a raw check that bypasses RLS
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id::text = auth.uid()::text  -- Explicit casting to fix uuid vs text error
    AND role::text = 'admin'
  );
END;
$$;

-- 2. Fix check_is_admin_or_manager (used by meal_cards/weekly_plans policies)
CREATE OR REPLACE FUNCTION public.check_is_admin_or_manager()
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Perform a raw check that bypasses RLS
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text  -- Explicit casting to fix uuid vs text error
    AND (role::text = 'admin' OR role::text = 'manager')
  );
END;
$$;

-- 3. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_is_admin_or_manager() TO authenticated;

-- 4. Clean up user_roles policies to be absolutely minimal
DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins and Managers can read all roles" ON public.user_roles;

-- Policy 1: Self-Reading (Non-recursive)
CREATE POLICY "Users can read own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id::text = auth.uid()::text -- Explicit casting
);

-- Policy 2: Admin/Manager Reading (Uses Security Definer function to break recursion)
CREATE POLICY "Admins and Managers can read all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.check_is_admin_or_manager()
);

-- Note: We do NOT put a policy on user_roles that *checks* user_roles via a non-security-definer path. 
-- check_is_admin_or_manager IS security definer, so it reads user_roles WITHOUT triggering this policy.
