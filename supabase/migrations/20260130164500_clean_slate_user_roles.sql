-- CLEAN SLATE FIX for user_roles
-- Dynamically drop ALL policies on user_roles to ensure no lingering recursive policies exist.

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Loop through all policies for the user_roles table
  FOR r IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_roles'
  LOOP
    -- Dynamic Drop
    RAISE NOTICE 'Dropping policy: %', r.policyname;
    EXECUTE 'DROP POLICY "' || r.policyname || '" ON public.user_roles';
  END LOOP;
END $$;

-- Now re-apply the robust, non-recursive policy
-- 1. Safe Function
CREATE OR REPLACE FUNCTION public.recursion_immune_role_check_v2()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_exists BOOLEAN;
BEGIN
  -- Set flag
  PERFORM set_config('app.in_role_check', 'true', true);
  
  -- Check table
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND (role::text = 'admin' OR role::text = 'manager')
  ) INTO role_exists;
  
  RETURN role_exists;
END;
$$;

-- 2. Policy
CREATE POLICY "Unified Role Access Policy"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  -- 1. Self Access
  user_id::text = auth.uid()::text
  
  OR
  
  -- 2. Recursion Break
  (current_setting('app.in_role_check', true) = 'true')
  
  OR
  
  -- 3. Privileged Access
  public.recursion_immune_role_check_v2()
);

-- 3. Grants
GRANT EXECUTE ON FUNCTION public.recursion_immune_role_check_v2() TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
