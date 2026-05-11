-- Enable UPDATE for clients on assessments table
-- This allows clients to "delete" (detach) files from assessments by setting file fields to null
CREATE POLICY "Clients can update own assessments"
ON public.assessments FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = assessments.client_id
    AND clients.user_id::text = auth.uid()::text
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = assessments.client_id
    AND clients.user_id::text = auth.uid()::text
  )
);
