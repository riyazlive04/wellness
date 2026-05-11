-- Allow Managers to manage calendar events
-- 1. Create is_staff() function (Admin OR Manager)
-- 2. Update calendar_events RLS policies

-- Create helper function for "Staff" (Admin + Manager) access
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_exists BOOLEAN;
BEGIN
  -- We reuse the recursion immune check logic implicitly by querying user_roles directly
  -- or we could call recursion_immune_role_check() if available.
  -- But let's be explicit and safe here to avoid dependency hell.
  PERFORM set_config('app.in_role_check', 'true', true);
  
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND (role::text = 'admin' OR role::text = 'manager')
  ) INTO staff_exists;
  
  RETURN staff_exists;
END;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- Update RLS Policies for calendar_events
DROP POLICY IF EXISTS "Admins can view all calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Clients can view their own calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Admins can insert calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Admins can update calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Admins can delete calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Staff can view all calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Staff can insert calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Staff can update calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Staff can delete calendar events" ON public.calendar_events;

-- SELECT: Staff can view all events
CREATE POLICY "Staff can view all calendar events"
  ON public.calendar_events
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

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

-- INSERT: Staff
CREATE POLICY "Staff can insert calendar events"
  ON public.calendar_events
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

-- UPDATE: Staff
CREATE POLICY "Staff can update calendar events"
  ON public.calendar_events
  FOR UPDATE
  TO authenticated
  USING (public.is_staff());

-- DELETE: Staff
CREATE POLICY "Staff can delete calendar events"
  ON public.calendar_events
  FOR DELETE
  TO authenticated
  USING (public.is_staff());
