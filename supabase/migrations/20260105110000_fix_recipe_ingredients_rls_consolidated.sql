-- Fix recipe_ingredients RLS policies for consistency with other tables
-- This ensures admins can update recipes and their ingredients without RLS violations

-- =====================================================================
-- STEP 1: Clean up existing policies
-- =====================================================================

DROP POLICY IF EXISTS "Authenticated users can view recipe ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Admins can manage recipe ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Admins can insert recipe ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Admins can update recipe ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Admins can delete recipe ingredients" ON public.recipe_ingredients;

-- =====================================================================
-- STEP 2: Ensure default UUID generation
-- =====================================================================

ALTER TABLE public.recipe_ingredients ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- =====================================================================
-- STEP 3: Re-enable RLS
-- =====================================================================

ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- STEP 4: Create clean, consistent policies
-- =====================================================================

-- SELECT: All authenticated users can view
CREATE POLICY "Authenticated users can view recipe ingredients"
  ON public.recipe_ingredients
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Admins only
CREATE POLICY "Admins can insert recipe ingredients"
  ON public.recipe_ingredients
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- UPDATE: Admins only
CREATE POLICY "Admins can update recipe ingredients"
  ON public.recipe_ingredients
  FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- DELETE: Admins only
CREATE POLICY "Admins can delete recipe ingredients"
  ON public.recipe_ingredients
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================================================================
-- STEP 5: Grant permissions
-- =====================================================================

GRANT SELECT ON public.recipe_ingredients TO authenticated;
GRANT ALL ON public.recipe_ingredients TO service_role;

-- =====================================================================
-- Migration complete
-- recipe_ingredients now has consistent RLS policies:
-- - All authenticated users can view
-- - Only admins can insert/update/delete
-- =====================================================================
