-- Clean slate: Drop ALL policies on recipe_ingredients to ensure no conflicts
DROP POLICY IF EXISTS "Authenticated users can view recipe ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Admins can manage recipe ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Admins can insert recipe ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Admins can update recipe ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Admins can delete recipe ingredients" ON public.recipe_ingredients;

-- Fix missing default value for id column in recipe_ingredients table
ALTER TABLE public.recipe_ingredients ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Re-enable RLS
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- 1. View Policy (for all authenticated users)
CREATE POLICY "Authenticated users can view recipe ingredients"
  ON public.recipe_ingredients
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Insert Policy (Admins only, using secure function)
CREATE POLICY "Admins can insert recipe ingredients"
  ON public.recipe_ingredients
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- 3. Update Policy (Admins only)
CREATE POLICY "Admins can update recipe ingredients"
  ON public.recipe_ingredients
  FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- 4. Delete Policy (Admins only)
CREATE POLICY "Admins can delete recipe ingredients"
  ON public.recipe_ingredients
  FOR DELETE
  TO authenticated
  USING (public.is_admin());
