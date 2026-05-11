-- Drop existing meal-photos policies
DROP POLICY IF EXISTS "Clients can upload their meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Clients can view their meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Clients can delete their meal photos" ON storage.objects;

-- Recreate simplified policies without foldername check
CREATE POLICY "Clients can upload their meal photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'meal-photos'
  AND EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
  )
);

CREATE POLICY "Clients can view their meal photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'meal-photos'
  AND EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
  )
);

CREATE POLICY "Clients can delete their meal photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'meal-photos'
  AND EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
  )
);