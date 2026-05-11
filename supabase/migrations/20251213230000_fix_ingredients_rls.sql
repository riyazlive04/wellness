-- Fix ingredients table RLS INSERT policy
-- Simplified approach: Remove the role comparison and just check user_roles existence
-- This migration adds an explicit INSERT policy for admin users

-- Drop the existing "FOR ALL" policy and recreate with explicit policies
DROP POLICY IF EXISTS "Admins can manage ingredients" ON public.ingredients;

-- Create separate policies for better clarity and reliability
-- Using a simpler approach that checks if user exists in user_roles with admin role
CREATE POLICY "Admins can insert ingredients"
  ON public.ingredients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update ingredients"
  ON public.ingredients
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete ingredients"
  ON public.ingredients
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- The SELECT policy for authenticated users already exists and is fine
