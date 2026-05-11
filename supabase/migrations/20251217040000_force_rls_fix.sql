-- Force RLS Policy Update
-- The previous migration might have skipped this if the policy already existed.

-- 1. Drop the existing policy to be sure
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;

-- 2. Re-create the policy with explicit text casting to handle potential type mismatches
-- This ensures that whether user_id is UUID or TEXT, it matches auth.uid() (UUID) correctly.
CREATE POLICY "Users can read own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid()::text = user_id::text);

-- 3. Verify Grants
GRANT SELECT ON public.user_roles TO authenticated;
