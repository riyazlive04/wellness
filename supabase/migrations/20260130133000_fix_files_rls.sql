-- Enable SELECT for clients on files table
CREATE POLICY "Clients can view own files"
ON public.files FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = files.client_id
    AND clients.user_id::text = auth.uid()::text
  )
);

-- Enable DELETE for clients on assessments table (only for generic file uploads)
-- This allows users to delete files they uploaded via the Files tab which are stored as assessments with generic/null type
CREATE POLICY "Clients can delete own file uploads"
ON public.assessments FOR DELETE
TO authenticated
USING (
  assessment_type IS NULL
  AND
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = assessments.client_id
    AND clients.user_id::text = auth.uid()::text
  )
);
