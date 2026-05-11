-- Clean slate: Drop ALL policies on recipes to ensure no conflicts
DROP POLICY IF EXISTS "Authenticated users can view recipes" ON public.recipes;
DROP POLICY IF EXISTS "Admins can manage recipes" ON public.recipes;
DROP POLICY IF EXISTS "Admins can insert recipes" ON public.recipes;
DROP POLICY IF EXISTS "Admins can update recipes" ON public.recipes;
DROP POLICY IF EXISTS "Admins can delete recipes" ON public.recipes;

-- Fix missing default value for id column in recipes table
ALTER TABLE public.recipes ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Re-enable RLS
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

-- 1. View Policy (for all authenticated users)
CREATE POLICY "Authenticated users can view recipes"
  ON public.recipes
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Insert Policy (Admins only, using secure function)
CREATE POLICY "Admins can insert recipes"
  ON public.recipes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- 3. Update Policy (Admins only)
CREATE POLICY "Admins can update recipes"
  ON public.recipes
  FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- 4. Delete Policy (Admins only)
CREATE POLICY "Admins can delete recipes"
  ON public.recipes
  FOR DELETE
  TO authenticated
  USING (public.is_admin());
