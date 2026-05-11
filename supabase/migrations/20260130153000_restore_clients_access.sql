-- Restore Client Visibility
-- Fixes type casting issues in has_role and updates Client RLS to be robust

-- 1. Fix has_role (UUID, Text version - PRIMARY)
-- We only use the text version since app_role type might be missing or inconsistent
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = _user_id::text
      AND role::text = _role
  )
$$;

-- 3. Update Clients Table RLS
-- Drop potentially broken policies
DROP POLICY IF EXISTS "Admins can view all clients" ON public.clients;
DROP POLICY IF EXISTS "Admins and Managers can view all clients" ON public.clients;
DROP POLICY IF EXISTS "Clients can view their own data" ON public.clients;

-- Recreate Robust Policies

-- Admin/Manager View
CREATE POLICY "Admins and Managers can view all clients"
ON public.clients
FOR SELECT
TO authenticated
USING (
  public.check_is_admin_or_manager()
);

-- Client Self View (Robust Casting)
CREATE POLICY "Clients can view their own data"
ON public.clients
FOR SELECT
TO authenticated
USING (
  user_id::text = auth.uid()::text
);

-- 4. Ensure RLS is enabled
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- 5. Grant permissions (just in case)
GRANT SELECT ON public.clients TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated;
