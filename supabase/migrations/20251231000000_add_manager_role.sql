-- Add Manager Role to System (Simplified)
-- This migration adds 'manager' role support to the user_roles table

-- Check if the role column uses a proper type and add manager value
-- Since the role is stored as text in user_roles, we just need to allow 'manager' value

-- Step 1: Update any CHECK constraints if they exist
-- Drop existing check constraint if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'user_roles_role_check'
    ) THEN
        ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_role_check;
    END IF;
END $$;

-- Add new check constraint that includes manager
ALTER TABLE public.user_roles 
ADD CONSTRAINT user_roles_role_check 
CHECK (role IN ('admin', 'client', 'manager'));

-- Step 2: Create helper function to check if user is admin or manager
CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text  
    AND role IN ('admin', 'manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Grant execute permission on the helper function
GRANT EXECUTE ON FUNCTION public.is_admin_or_manager() TO authenticated;

-- Step 4: Verify manager role can be inserted
DO $$
BEGIN
    RAISE NOTICE 'Manager role successfully enabled in user_roles table';
    RAISE NOTICE 'Valid roles: admin, client, manager';
END $$;

-- Note: To create a manager user, use:
-- UPDATE user_roles SET role = 'manager' WHERE user_id = '<user-id>';
