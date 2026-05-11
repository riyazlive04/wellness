-- Consolidated fix for Recipe and Ingredient RLS policies
-- Run this manually in Supabase SQL Editor

-- 1. Recipes
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select recipes" ON public.recipes;
DROP POLICY IF EXISTS "Authenticated users can view recipes" ON public.recipes;
DROP POLICY IF EXISTS "Admins can manage recipes" ON public.recipes;

CREATE POLICY "Authenticated users can view recipes"
  ON public.recipes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage recipes"
  ON public.recipes
  FOR ALL
  TO authenticated
  USING (public.is_admin());

-- 2. Ingredients
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Admins can manage ingredients" ON public.ingredients;

CREATE POLICY "Authenticated users can view ingredients"
  ON public.ingredients
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage ingredients"
  ON public.ingredients
  FOR ALL
  TO authenticated
  USING (public.is_admin());

-- 3. Recipe Ingredients
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view recipe ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Admins can manage recipe ingredients" ON public.recipe_ingredients;

CREATE POLICY "Authenticated users can view recipe ingredients"
  ON public.recipe_ingredients
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage recipe ingredients"
  ON public.recipe_ingredients
  FOR ALL
  TO authenticated
  USING (public.is_admin());
