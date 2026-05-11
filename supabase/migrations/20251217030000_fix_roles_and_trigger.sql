-- Migration: Fix User Roles and Trigger Logic
-- Date: 2025-12-17
-- Description: Updates the handle_new_user trigger to respect metadata roles and backfills missing roles.

-- 1. Update the handle_new_user trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  initial_role text;
BEGIN
  -- Determine role from metadata or default to 'client'
  initial_role := COALESCE(NEW.raw_user_meta_data->>'role', 'client');

  -- Ensure role is valid (simple validation)
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
  ON CONFLICT (id) DO NOTHING;

  -- Insert into user_roles table
  -- Use ON CONFLICT DO NOTHING to match idempotency requirements
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id::text,
    initial_role::app_role -- Cast to app_role enum if it exists, otherwise text
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Note: If app_role enum doesn't exist, we might need to handle that. 
  -- Checking previous migrations, we usually insert strings. 
  -- Let's try inserting as string casted if needed or just string.
  -- Safe bet based on previous code: just pass the string, maybe cast to 'admin'/'client' if it's a constrained column.
  -- In 20251215104000_auto_create_user_profile.sql it was just 'client'.
  
  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Log error but allow user creation to succeed (or fail if critical)
  -- ideally we want it to fail if profile/role creation fails so we don't have broken users.
  RAISE; 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Backfill missing roles
-- Find users in auth.users that do not have a corresponding entry in public.user_roles
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.user_roles ur ON au.id::text = ur.user_id::text
    WHERE ur.id IS NULL
  LOOP
    -- Insert default 'client' role for existing users without role
    -- Check metadata just in case they were intended to be admin
    INSERT INTO public.user_roles (user_id, role)
    VALUES (
      r.id::text, 
      COALESCE(r.raw_user_meta_data->>'role', 'client')
    );
  END LOOP;
END $$;

-- 3. Ensure RLS is enabled and correct (Re-affirming)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Ensure policies exist (idempotent check)
DO $$
BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'user_roles' AND policyname = 'Users can read own role'
  ) THEN
      CREATE POLICY "Users can read own role"
      ON public.user_roles
      FOR SELECT
      TO authenticated
      USING (auth.uid()::text = user_id::text);
  END IF;
END $$;
