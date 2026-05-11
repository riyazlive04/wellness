-- Fix SQL Type Errors in Auth Functions (Text vs UUID)

-- 1. Fix is_admin with explicit casting
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_roles.user_id::text = auth.uid()::text -- Explicit cast to text
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Fix get_user_role with explicit casting
CREATE OR REPLACE FUNCTION public.get_user_role(target_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
BEGIN
  -- Check if user is requesting their own role
  IF target_user_id::text = auth.uid()::text THEN
    SELECT role INTO _role FROM public.user_roles WHERE user_id::text = target_user_id::text;
    RETURN _role;
  END IF;

  -- Check if user is admin (using the Safe is_admin)
  IF public.is_admin() THEN
    SELECT role INTO _role FROM public.user_roles WHERE user_id::text = target_user_id::text;
    RETURN _role;
  END IF;

  RETURN NULL;
END;
$$;
