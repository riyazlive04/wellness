-- 2026-05-11: original migration assumed user_roles.role was text and added
-- a CHECK constraint. In a clean dev rebuild role is the public.app_role enum
-- (created by earlier migrations). Rewritten to extend the enum instead.

-- Add 'manager' to the app_role enum if not already present
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';

-- Helper function: is the current user admin or manager?
CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
      AND role::text IN ('admin', 'manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_admin_or_manager() TO authenticated;
