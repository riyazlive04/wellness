-- Robust Fix for Meal Cards and Weekly Plans RLS
-- Explicitly allow Admins AND Managers to manage these tables

-- 1. Fix user_roles lookup helper to be absolutely safe
CREATE OR REPLACE FUNCTION public.check_is_admin_or_manager()
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND (role::text = 'admin' OR role::text = 'manager')
  );
END;
$$;

-- 2. Weekly Plans Policies
DROP POLICY IF EXISTS "Admins can manage plans" ON public.weekly_plans;
DROP POLICY IF EXISTS "Admins can view all plans" ON public.weekly_plans;
DROP POLICY IF EXISTS "Admins and Managers can manage plans" ON public.weekly_plans;

CREATE POLICY "Admins and Managers can manage plans"
ON public.weekly_plans
FOR ALL
TO authenticated
USING (public.check_is_admin_or_manager())
WITH CHECK (public.check_is_admin_or_manager());

-- 3. Meal Cards Policies
DROP POLICY IF EXISTS "Admins can manage meal cards" ON public.meal_cards;
DROP POLICY IF EXISTS "Admins can view all meal cards" ON public.meal_cards;
DROP POLICY IF EXISTS "Admins and Managers can manage meal cards" ON public.meal_cards;

CREATE POLICY "Admins and Managers can manage meal cards"
ON public.meal_cards
FOR ALL
TO authenticated
USING (public.check_is_admin_or_manager())
WITH CHECK (public.check_is_admin_or_manager());

-- 4. Ensure RLS is active
ALTER TABLE public.weekly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_cards ENABLE ROW LEVEL SECURITY;

-- 5. Grant access to the function
GRANT EXECUTE ON FUNCTION public.check_is_admin_or_manager() TO authenticated;
