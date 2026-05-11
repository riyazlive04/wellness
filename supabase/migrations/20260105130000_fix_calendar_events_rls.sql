-- Fix calendar_events RLS policies to ensure admins can schedule meetings
-- This replaces outdated has_role() function with current is_admin()

-- =====================================================================
-- STEP 1: Clean up existing policies
-- =====================================================================

DROP POLICY IF EXISTS "Admins can manage all events" ON public.calendar_events;
DROP POLICY IF EXISTS "Clients can view their events" ON public.calendar_events;
DROP POLICY IF EXISTS "Admins can manage all calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can view their own calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Admins can view all calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Clients can view their own calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Admins can insert calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Admins can update calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Admins can delete calendar events" ON public.calendar_events;

-- =====================================================================
-- STEP 2: Ensure default UUID generation
-- =====================================================================

ALTER TABLE public.calendar_events ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- =====================================================================
-- STEP 3: Re-enable RLS
-- =====================================================================

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- STEP 4: Create fresh policies using current is_admin() function
-- =====================================================================

-- SELECT: Admins can view all events
CREATE POLICY "Admins can view all calendar events"
  ON public.calendar_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- SELECT: Clients can view their own events
CREATE POLICY "Clients can view their own calendar events"
  ON public.calendar_events
  FOR SELECT
  TO authenticated
  USING (
    auth.uid()::text IN (
      SELECT user_id::text FROM public.clients 
      WHERE id::text = calendar_events.client_id::text
    )
  );

-- INSERT: Admins only
CREATE POLICY "Admins can insert calendar events"
  ON public.calendar_events
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- UPDATE: Admins only
CREATE POLICY "Admins can update calendar events"
  ON public.calendar_events
  FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- DELETE: Admins only
CREATE POLICY "Admins can delete calendar events"
  ON public.calendar_events
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- =====================================================================
-- STEP 5: Grant permissions
-- =====================================================================

GRANT SELECT ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;

-- =====================================================================
-- Migration complete
-- calendar_events now has refreshed RLS policies:
-- - Admins can create, view, update, delete all events
-- - Clients can view their own events
-- - Uses current is_admin() function
-- =====================================================================
