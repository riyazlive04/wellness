-- Clean slate: Drop ALL policies on food_items to ensure no conflicts
DROP POLICY IF EXISTS "Authenticated users can view food items" ON public.food_items;
DROP POLICY IF EXISTS "Admins can manage food items" ON public.food_items;
DROP POLICY IF EXISTS "Admins can insert food items" ON public.food_items;
DROP POLICY IF EXISTS "Admins can update food items" ON public.food_items;
DROP POLICY IF EXISTS "Admins can delete food items" ON public.food_items;

-- Re-enable RLS
ALTER TABLE public.food_items ENABLE ROW LEVEL SECURITY;

-- 1. View Policy (for all authenticated users)
CREATE POLICY "Authenticated users can view food items"
  ON public.food_items
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Insert Policy (Admins only, using secure function)
CREATE POLICY "Admins can insert food items"
  ON public.food_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- 3. Update Policy (Admins only)
CREATE POLICY "Admins can update food items"
  ON public.food_items
  FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- 4. Delete Policy (Admins only)
CREATE POLICY "Admins can delete food items"
  ON public.food_items
  FOR DELETE
  TO authenticated
  USING (public.is_admin());
