-- Fix Enums and RLS
-- This migration updates the Enums to support new meal types and manager role
-- And re-enforces RLS policies

-- 1. Update meal_type Enum
-- We use a DO block to safely add values if they don't exist
-- Note: ALTER TYPE cannot run inside a transaction block normally, but we wrap in DO for logic checks?
-- Actually, ALTER TYPE ADD VALUE must be top level.
-- If this fails due to transaction, we might need a different approach, but let's try.

ALTER TYPE public.meal_type ADD VALUE IF NOT EXISTS 'early_morning';
ALTER TYPE public.meal_type ADD VALUE IF NOT EXISTS 'mid_morning';
ALTER TYPE public.meal_type ADD VALUE IF NOT EXISTS 'evening_snack_1';
ALTER TYPE public.meal_type ADD VALUE IF NOT EXISTS 'evening_snack_2';

-- 2. Update app_role Enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';

-- 3. Fix user_roles column type if needed? 
-- It is likely 'app_role', so adding 'manager' to enum allows 'manager' in column.

-- 4. Robust RLS for Meal Cards - REAPPLYING just to be safe
DROP POLICY IF EXISTS "Admins and Managers can manage meal cards" ON public.meal_cards;

CREATE POLICY "Admins and Managers can manage meal cards"
ON public.meal_cards
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND (role::text = 'admin' OR role::text = 'manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND (role::text = 'admin' OR role::text = 'manager')
  )
);

-- 5. Robust RLS for Weekly Plans
DROP POLICY IF EXISTS "Admins and Managers can manage plans" ON public.weekly_plans;

CREATE POLICY "Admins and Managers can manage plans"
ON public.weekly_plans
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND (role::text = 'admin' OR role::text = 'manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND (role::text = 'admin' OR role::text = 'manager')
  )
);
