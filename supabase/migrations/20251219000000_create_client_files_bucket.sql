-- Create the 'client-files' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-files', 'client-files', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on objects (it's usually enabled by default on storage.objects, but good to be safe if specific to bucket? No, storage.objects is global)

-- Policy: Clients can view their own files
-- We check if the first path segment matches the client_id linked to the current user
CREATE POLICY "Clients can view own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-files' AND (
    -- Allow if user is admin
    EXISTS (SELECT 1 FROM user_roles WHERE user_id::text = auth.uid()::text AND role = 'admin')
    OR
    -- Allow if folder name matches client_id owned by user
    (storage.foldername(name))[1] = (select id::text from clients where user_id::text = auth.uid()::text)
  )
);

-- Policy: Clients can upload files to their own folder
CREATE POLICY "Clients can upload own files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-files' AND (
    -- Allow if user is admin (optional, but good for testing)
    EXISTS (SELECT 1 FROM user_roles WHERE user_id::text = auth.uid()::text AND role = 'admin')
    OR
    -- Allow if folder name matches client_id owned by user
    (storage.foldername(name))[1] = (select id::text from clients where user_id::text = auth.uid()::text)
  )
);

-- Policy: Clients can delete their own files
CREATE POLICY "Clients can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-files' AND (
    -- Allow if user is admin
    EXISTS (SELECT 1 FROM user_roles WHERE user_id::text = auth.uid()::text AND role = 'admin')
    OR
    -- Allow if folder name matches client_id owned by user
    (storage.foldername(name))[1] = (select id::text from clients where user_id::text = auth.uid()::text)
  )
);
