-- Fix RLS functions to use safe type casting (Text = Text) to avoid "operator does not exist: uuid = text" errors

-- 1. Fix is_admin to strictly cast both sides to text
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_roles.user_id::text = auth.uid()::text -- Safe comparison
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Harden is_own_client to also use safe casting
CREATE OR REPLACE FUNCTION public.is_own_client(_client_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client_uuid uuid;
BEGIN
  IF _client_id IS NULL OR _client_id = 'undefined' THEN
    RETURN false;
  END IF;

  BEGIN
    _client_uuid := _client_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  RETURN EXISTS (
    SELECT 1
    FROM public.clients
    WHERE id::text = _client_uuid::text 
    AND user_id::text = auth.uid()::text -- Safe comparison
  );
END;
$$;

-- 3. Re-grant permissions just in case
GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_own_client TO authenticated;
