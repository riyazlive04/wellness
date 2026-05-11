-- Use security definer function for Admin access to clients to avoid Recursive RLS
-- This ensures that even if user_roles is not readable in some context, the function (running as owner) can check it.

DROP POLICY IF EXISTS "Admins can manage all clients" ON public.clients;

CREATE POLICY "Admins can manage all clients"
ON public.clients
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Ensure Admins can also update/delete/insert (covered by ALL, but let's be explicit if needed, ALL is fine)

-- Also verify user_roles policy just in case
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));
