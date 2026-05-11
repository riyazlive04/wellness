-- Migration to fix handle_new_user trigger and ensure manager support
-- This explicitly adds 'manager' to the allowed roles list in the trigger and RPC functions

-- 1. Fix trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  initial_role text;
BEGIN
  -- Determine role from metadata or default to 'client'
  initial_role := COALESCE(NEW.raw_user_meta_data->>'role', 'client');

  -- Ensure role is valid (Include manager here)
  IF initial_role NOT IN ('admin', 'client', 'manager') THEN
    initial_role := 'client';
  END IF;

  -- Insert into profiles table
  INSERT INTO public.profiles (id, email, name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email;

  -- Insert into user_roles table
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id::text,
    initial_role
  )
  ON CONFLICT (user_id) DO UPDATE SET
    role = EXCLUDED.role;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Ensure ensure_user_role is correct
CREATE OR REPLACE FUNCTION public.ensure_user_role(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
BEGIN
  -- 1. Try to find in user_roles table
  SELECT role INTO _role 
  FROM public.user_roles 
  WHERE user_id::text = p_user_id::text;

  -- 2. If not found, check metadata
  IF _role IS NULL THEN
    SELECT (raw_user_meta_data->>'role') INTO _role
    FROM auth.users
    WHERE id = p_user_id;
  END IF;

  -- 3. If still not found, default to client
  IF _role IS NULL OR _role NOT IN ('admin', 'client', 'manager') THEN
    _role := 'client';
  END IF;

  -- 4. Persist to table if not there
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id::text, _role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  RETURN _role;
END;
$$;
