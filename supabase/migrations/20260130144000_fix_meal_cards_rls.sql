-- Fix RLS for weekly_plans to ensure Admins can manage them
DROP POLICY IF EXISTS "Admins can manage plans" ON public.weekly_plans;
DROP POLICY IF EXISTS "Admins can view all plans" ON public.weekly_plans;

CREATE POLICY "Admins can manage plans"
ON public.weekly_plans
FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Fix RLS for meal_cards to ensure Admins can manage them
DROP POLICY IF EXISTS "Admins can manage meal cards" ON public.meal_cards;
DROP POLICY IF EXISTS "Admins can view all meal cards" ON public.meal_cards;

CREATE POLICY "Admins can manage meal cards"
ON public.meal_cards
FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Ensure RLS is enabled
ALTER TABLE public.weekly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_cards ENABLE ROW LEVEL SECURITY;
