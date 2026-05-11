-- Policy: Clients can upload (insert) their own files
CREATE POLICY "Clients can upload own files"
ON public.files FOR INSERT
TO authenticated
WITH CHECK (
  -- Allow if user is admin
  EXISTS (SELECT 1 FROM user_roles WHERE user_id::text = auth.uid()::text AND role = 'admin')
  OR
  -- Allow if client_id matches the one linked to appropriate user
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = files.client_id
    AND clients.user_id::text = auth.uid()::text
  )
);

-- Policy: Clients can delete their own files
CREATE POLICY "Clients can delete own files"
ON public.files FOR DELETE
TO authenticated
USING (
  -- Allow if user is admin
  EXISTS (SELECT 1 FROM user_roles WHERE user_id::text = auth.uid()::text AND role = 'admin')
  OR
  -- Allow if client_id matches the one linked to appropriate user
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = files.client_id
    AND clients.user_id::text = auth.uid()::text
  )
);
