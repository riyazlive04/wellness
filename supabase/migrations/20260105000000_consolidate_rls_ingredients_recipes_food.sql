-- Consolidate and Fix RLS for Ingredients, Recipes, and Food Items Tables
-- This migration ensures consistent, secure RLS policies across all three tables

-- =====================================================================
-- STEP 1: Ensure is_admin() function exists and is properly configured
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_roles.user_id::text = auth.uid()::text
    AND role::text = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- =====================================================================
-- STEP 2: Fix INGREDIENTS table
-- =====================================================================

-- Drop all existing policies to ensure clean slate
DROP POLICY IF EXISTS "Admins can manage ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Admins can insert ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Admins can update ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Admins can delete ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Authenticated users can view ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Users can view ingredients" ON public.ingredients;

-- Ensure default UUID generation
ALTER TABLE public.ingredients ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Re-enable RLS
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

-- Create clean policies
CREATE POLICY "Authenticated users can view ingredients"
  ON public.ingredients
  FOR SELECT
  TO authenticated
  USING (true);

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

-- =====================================================================
-- STEP 3: Fix RECIPES table
-- =====================================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Authenticated users can view recipes" ON public.recipes;
DROP POLICY IF EXISTS "Authenticated users can select recipes" ON public.recipes;
DROP POLICY IF EXISTS "Admins can manage recipes" ON public.recipes;
DROP POLICY IF EXISTS "Admins can insert recipes" ON public.recipes;
DROP POLICY IF EXISTS "Admins can update recipes" ON public.recipes;
DROP POLICY IF EXISTS "Admins can delete recipes" ON public.recipes;

-- Ensure default UUID generation
ALTER TABLE public.recipes ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Re-enable RLS
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

-- Create clean policies
CREATE POLICY "Authenticated users can view recipes"
  ON public.recipes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert recipes"
  ON public.recipes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update recipes"
  ON public.recipes
  FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete recipes"
  ON public.recipes
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================================================================
-- STEP 4: Fix FOOD_ITEMS table
-- =====================================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Authenticated users can view food items" ON public.food_items;
DROP POLICY IF EXISTS "Admins can manage food items" ON public.food_items;
DROP POLICY IF EXISTS "Admins can insert food items" ON public.food_items;
DROP POLICY IF EXISTS "Admins can update food items" ON public.food_items;
DROP POLICY IF EXISTS "Admins can delete food items" ON public.food_items;

-- Ensure default UUID generation
ALTER TABLE public.food_items ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Re-enable RLS
ALTER TABLE public.food_items ENABLE ROW LEVEL SECURITY;

-- Create clean policies
CREATE POLICY "Authenticated users can view food items"
  ON public.food_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert food items"
  ON public.food_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update food items"
  ON public.food_items
  FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete food items"
  ON public.food_items
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================================================================
-- STEP 5: Grant permissions
-- =====================================================================

-- Grant permissions to authenticated users
GRANT SELECT ON public.ingredients TO authenticated;
GRANT SELECT ON public.recipes TO authenticated;
GRANT SELECT ON public.food_items TO authenticated;

-- Grant all permissions to service_role (for admin operations)
GRANT ALL ON public.ingredients TO service_role;
GRANT ALL ON public.recipes TO service_role;
GRANT ALL ON public.food_items TO service_role;

-- =====================================================================
-- Migration complete
-- All three tables now have consistent, secure RLS policies:
-- - All authenticated users can view records (SELECT)
-- - Only admins can modify records (INSERT/UPDATE/DELETE)
-- =====================================================================
