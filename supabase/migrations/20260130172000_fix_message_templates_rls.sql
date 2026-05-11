-- Fix RLS for message_templates
-- The previous policies might have issues with role types or recursion
-- We will replace them with robust policies using public.is_admin()

DROP POLICY IF EXISTS "Anyone authenticated can view active templates" ON public.message_templates;
DROP POLICY IF EXISTS "Admins can manage templates" ON public.message_templates;

-- 1. View Policy: Allow ALL authenticated users to view ACTIVE templates
-- This is necessary for the frontend dropdowns
CREATE POLICY "Anyone authenticated can view active templates_v2"
ON public.message_templates FOR SELECT
USING (
  auth.role() = 'authenticated' 
  AND is_active = true
);

-- 2. Admin Policy: Allow Admins to do EVERYTHING
-- Uses the safe public.is_admin() function which avoids recursion/casting issues
CREATE POLICY "Admins can manage templates_v2"
ON public.message_templates FOR ALL
USING (
  public.is_admin()
)
WITH CHECK (
  public.is_admin()
);
