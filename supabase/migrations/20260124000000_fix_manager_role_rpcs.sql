-- Redefine role-related functions to properly support 'manager'
-- Ensuring that managers are NOT mistaken for admins in RPC responses

-- 1. Redefine get_user_role to handle managers correctly
CREATE OR REPLACE FUNCTION public.get_user_role(target_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
BEGIN
  SELECT role INTO _role 
  FROM public.user_roles 
  WHERE user_id::text = target_user_id::text;
  
  RETURN _role;
END;
$$;

-- 2. Redefine ensure_user_role to handle managers correctly
-- This is what AuthContext uses
CREATE OR REPLACE FUNCTION public.ensure_user_role(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
BEGIN
  -- Get existing role
  SELECT role INTO _role 
  FROM public.user_roles 
  WHERE user_id::text = p_user_id::text;

  -- If no role, default to client
  IF _role IS NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id::text, 'client')
    ON CONFLICT (user_id) DO NOTHING;
    _role := 'client';
  END IF;

  RETURN _role;
END;
$$;

-- 3. Update is_admin to be strict
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_roles.user_id::text = auth.uid()::text
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Update is_admin_or_manager helper
CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text  
    AND role IN ('admin', 'manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
