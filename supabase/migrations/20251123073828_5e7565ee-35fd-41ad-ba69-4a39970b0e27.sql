-- Allow clients to insert their own file records
CREATE POLICY "Clients can insert their own files"
ON public.files FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = files.client_id
    AND clients.user_id = auth.uid()
  )
);