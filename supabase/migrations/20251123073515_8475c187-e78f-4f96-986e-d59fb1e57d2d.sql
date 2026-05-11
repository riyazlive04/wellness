-- Drop old policies for client-files bucket
DROP POLICY IF EXISTS "Clients can upload their files" ON storage.objects;
DROP POLICY IF EXISTS "Clients can view their files" ON storage.objects;
DROP POLICY IF EXISTS "Clients can delete their files" ON storage.objects;

-- Recreate with simplified checks (no storage.foldername requirement)
CREATE POLICY "Clients can upload their files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-files'
  AND (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
  ))
);

CREATE POLICY "Clients can view their files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-files'
  AND (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
  ))
);

CREATE POLICY "Clients can delete their files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-files'
  AND (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
  ))
);