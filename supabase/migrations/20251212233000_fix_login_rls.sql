-- Ensure RLS is enabled
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can read own client profile" ON public.clients;
DROP POLICY IF EXISTS "Users can update own client profile" ON public.clients;
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;

-- Policy for Clients table: Users can read their own data
-- Cast both to text to avoid "operator does not exist: uuid = text" errors
CREATE POLICY "Users can read own client profile"
ON public.clients
FOR SELECT
USING (auth.uid()::text = user_id::text);

-- Policy for Clients table: Users can update their own data
CREATE POLICY "Users can update own client profile"
ON public.clients
FOR UPDATE
USING (auth.uid()::text = user_id::text);

-- Policy for User Roles: Users can read their own role
CREATE POLICY "Users can read own role"
ON public.user_roles
FOR SELECT
USING (auth.uid()::text = user_id::text);

-- Grant access to authenticated users
GRANT SELECT, UPDATE ON public.clients TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
