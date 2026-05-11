-- Fix User Roles RLS to ensure users can read their own role
-- This is critical for the login flow to determine if user is admin or client.

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Drop potentially conflicting or incorrect policies
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

-- Allow users to read their own role
CREATE POLICY "Users can read own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow admins to read all roles (using the has_role function if available, or just keeping it simple for now)
-- Note: Optimally we use the has_role function, but to avoid circular deps if that function reads user_roles, 
-- we can sometimes rely on a separate admin table. 
-- For now, let's just ensure the OWNER (user) can read.
-- If we need admins to read others:
-- CREATE POLICY "Admins can read all roles" ...

-- Ensure authenticated users have permission to SELECT
GRANT SELECT ON public.user_roles TO authenticated;
