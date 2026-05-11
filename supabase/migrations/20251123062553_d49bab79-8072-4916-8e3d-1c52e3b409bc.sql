-- Fix meal-photos bucket policies
DROP POLICY IF EXISTS "Clients can upload their meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Clients can view their meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Clients can delete their meal photos" ON storage.objects;

CREATE POLICY "Clients can upload their meal photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'meal-photos'
  AND (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
    AND (storage.foldername(name))[1] = clients.id::text
  ))
);

CREATE POLICY "Clients can view their meal photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'meal-photos'
  AND (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
    AND (storage.foldername(name))[1] = clients.id::text
  ))
);

CREATE POLICY "Clients can delete their meal photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'meal-photos'
  AND (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
    AND (storage.foldername(name))[1] = clients.id::text
  ))
);

-- Fix client-files bucket policies
DROP POLICY IF EXISTS "Clients can upload their files" ON storage.objects;
DROP POLICY IF EXISTS "Clients can view their files" ON storage.objects;
DROP POLICY IF EXISTS "Clients can delete their files" ON storage.objects;

CREATE POLICY "Clients can upload their files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-files'
  AND (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
    AND (storage.foldername(name))[1] = clients.id::text
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
    AND (storage.foldername(name))[1] = clients.id::text
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
    AND (storage.foldername(name))[1] = clients.id::text
  ))
);

-- Fix assessment-files bucket viewing policy
DROP POLICY IF EXISTS "Clients can view their assessment files" ON storage.objects;

CREATE POLICY "Clients can view their assessment files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'assessment-files'
  AND (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
    AND (storage.foldername(name))[1] = clients.id::text
  ))
);