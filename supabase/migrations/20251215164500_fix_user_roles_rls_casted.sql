-- Fix User Roles RLS with explicit casting to avoid type errors
-- We cast both to text to be absolutely safe against Postgres strictness

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

CREATE POLICY "Users can read own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid()::text = user_id::text);

GRANT SELECT ON public.user_roles TO authenticated;
