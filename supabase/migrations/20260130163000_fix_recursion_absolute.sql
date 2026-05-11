-- Absolute Fix for RLS Recursion
-- 1. Cleaning up potential residue
DROP POLICY IF EXISTS "Admins and Managers can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;

-- 2. Define the Immune Function with Session Flag
CREATE OR REPLACE FUNCTION public.recursion_immune_role_check()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_exists BOOLEAN;
BEGIN
  -- Set flag to 'true' for this transaction
  PERFORM set_config('app.in_role_check', 'true', true);
  
  -- Check user_roles table
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND (role::text = 'admin' OR role::text = 'manager')
  ) INTO role_exists;
  
  RETURN role_exists;
END;
$$;

-- 3. Force Owner to postgres (if possible, to ensure BypassRLS)
-- We wrap in a DO block to avoid error if postgres role doesn't exist (though it should)
DO $$
BEGIN
  BEGIN
    ALTER FUNCTION public.recursion_immune_role_check() OWNER TO postgres;
  EXCEPTION WHEN OTHERS THEN
    -- If postgres role missing, ignore. Function is still Security Definer.
    RAISE NOTICE 'Could not set owner to postgres, proceeding with current owner.';
  END;
END $$;

-- 4. Define Policy with Short-Circuit
CREATE POLICY "Users and Admins can read roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  -- 1. Allow User to read own role (Fast, Non-Recursive)
  user_id::text = auth.uid()::text
  
  OR
  
  -- 2. Check Recursion Flag (Fast, preventing loop)
  (current_setting('app.in_role_check', true) = 'true')
  
  OR
  
  -- 3. Check Admin/Manager Status (Slow, Sets Flag, Recurses once then hits #2)
  public.recursion_immune_role_check()
);

-- 5. Fix generic is_admin too
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_adm BOOLEAN;
BEGIN
  PERFORM set_config('app.in_role_check', 'true', true);
  
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND role::text = 'admin'
  ) INTO is_adm;
  
  RETURN is_adm;
END;
$$;

-- Try to set owner for is_admin too
DO $$
BEGIN
  BEGIN
    ALTER FUNCTION public.is_admin() OWNER TO postgres;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

GRANT EXECUTE ON FUNCTION public.recursion_immune_role_check() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
