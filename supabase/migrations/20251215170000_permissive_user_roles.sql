-- Ultra permissive RLS for user_roles to diagnose Access Denied
-- This allows any authenticated user to read ALL user roles. 
-- While not ideal for strict privacy, it is necessary to rule out RLS scoping issues.

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.user_roles;

-- Allow ALL authenticated users to select ANY role
CREATE POLICY "Enable read access for all authenticated users"
ON public.user_roles
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.user_roles TO authenticated;
