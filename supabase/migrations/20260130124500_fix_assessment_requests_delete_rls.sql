-- Fix RLS policies for assessment_requests to allow DELETE
-- 1. Ensure Admins have full access
DROP POLICY IF EXISTS "Admins can manage assessment requests" ON public.assessment_requests;
CREATE POLICY "Admins can manage assessment requests"
  ON public.assessment_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id::text = auth.uid()::text
      AND role::text = 'admin'
    )
  );

-- 2. Ensure Managers have full access
DROP POLICY IF EXISTS "Managers can manage assessment requests" ON public.assessment_requests;
CREATE POLICY "Managers can manage assessment requests"
  ON public.assessment_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id::text = auth.uid()::text
      AND role::text = 'manager'
    )
  );

-- 3. Allow Clients to delete their own PENDING requests
DROP POLICY IF EXISTS "Clients can delete their own pending requests" ON public.assessment_requests;
CREATE POLICY "Clients can delete their own pending requests"
  ON public.assessment_requests FOR DELETE
  USING (
    status = 'pending' AND
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = assessment_requests.client_id
      AND clients.user_id::text = auth.uid()::text
    )
  );
