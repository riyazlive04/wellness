-- Fix admin_notes RLS policies to ensure admins can create/edit notes
-- This ensures consistency with the updated is_admin() function

-- =====================================================================
-- STEP 1: Clean up existing policies
-- =====================================================================

DROP POLICY IF EXISTS "Admins can view admin_notes" ON public.admin_notes;
DROP POLICY IF EXISTS "Admins can insert admin_notes" ON public.admin_notes;
DROP POLICY IF EXISTS "Admins can update admin_notes" ON public.admin_notes;
DROP POLICY IF EXISTS "Admins can delete admin_notes" ON public.admin_notes;

-- =====================================================================
-- STEP 2: Ensure default UUID generation
-- =====================================================================

ALTER TABLE public.admin_notes ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- =====================================================================
-- STEP 3: Re-enable RLS
-- =====================================================================

ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- STEP 4: Create fresh policies using current is_admin() function
-- =====================================================================

CREATE POLICY "Admins can view admin_notes"
  ON public.admin_notes
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can insert admin_notes"
  ON public.admin_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update admin_notes"
  ON public.admin_notes
  FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete admin_notes"
  ON public.admin_notes
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================================================================
-- STEP 5: Grant permissions
-- =====================================================================

GRANT ALL ON public.admin_notes TO authenticated;
GRANT ALL ON public.admin_notes TO service_role;

-- =====================================================================
-- Migration complete
-- admin_notes now has refreshed RLS policies:
-- - Only admins can view, insert, update, and delete notes
-- - Uses current is_admin() function
-- =====================================================================
