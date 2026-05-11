-- Clean slate: Drop ALL policies on ingredients to ensure no conflicts
DROP POLICY IF EXISTS "Admins can manage ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Admins can insert ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Admins can update ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Admins can delete ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Authenticated users can view ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Users can view ingredients" ON public.ingredients;

-- Re-enable RLS (just in case)
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

-- 1. View Policy (for all authenticated users)
CREATE POLICY "Authenticated users can view ingredients"
  ON public.ingredients
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Insert Policy (Admins only, using secure function)
CREATE POLICY "Admins can insert ingredients"
  ON public.ingredients
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- 3. Update Policy (Admins only)
CREATE POLICY "Admins can update ingredients"
  ON public.ingredients
  FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- 4. Delete Policy (Admins only)
CREATE POLICY "Admins can delete ingredients"
  ON public.ingredients
  FOR DELETE
  TO authenticated
  USING (public.is_admin());
