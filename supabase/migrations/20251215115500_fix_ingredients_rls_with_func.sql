-- Create a secure function to check if the current user is an admin
-- SECURITY DEFINER ensures this runs with the privileges of the function creator (postgres),
-- bypassing RLS on the user_roles table for this specific check.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Update ingredients policies to use the new function
DROP POLICY IF EXISTS "Admins can insert ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Admins can update ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Admins can delete ingredients" ON public.ingredients;

CREATE POLICY "Admins can insert ingredients"
  ON public.ingredients
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update ingredients"
  ON public.ingredients
  FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete ingredients"
  ON public.ingredients
  FOR DELETE
  TO authenticated
  USING (public.is_admin());
