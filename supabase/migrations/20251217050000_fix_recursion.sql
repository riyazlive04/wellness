-- Fix Infinite Recursion in RLS
-- The policy "Admins can view all roles" calls has_role(), which queries user_roles.
-- This creates a cycle: Query user_roles -> Check Policy -> Call has_role -> Query user_roles -> ...

-- 1. Drop the problematic recursive policies
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;

-- 2. Ensure the "Users can read own role" policy is still there (safe)
-- We re-state it just to be sure, using the text casting fix we discovered earlier.
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;

CREATE POLICY "Users can read own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid()::text = user_id::text);

-- 3. Grant permissions
GRANT SELECT ON public.user_roles TO authenticated;
