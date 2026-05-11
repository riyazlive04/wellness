-- Fix storage RLS by removing problematic owner column check
-- Rely on path-based security (is_own_client) which is sufficient and typesafe

-- 1. Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can upload meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view meal photos" ON storage.objects;

-- 2. Create policies relying purely on path verification
-- "owner" check is implicit because you can only get the JWT for your own UID,
-- and is_own_client checks that the path maps to a Client ID owned by that UID.

-- INSERT POLICY
CREATE POLICY "Authenticated users can upload meal photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'meal-photos' AND
  public.is_own_client((storage.foldername(name))[1])
);

-- SELECT POLICY
CREATE POLICY "Authenticated users can view meal photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'meal-photos' AND
  public.is_own_client((storage.foldername(name))[1])
);

-- 3. Ensure Admin access is preserved (re-applying just in case)
DROP POLICY IF EXISTS "Admins can view all meal photos" ON storage.objects;

CREATE POLICY "Admins can view all meal photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'meal-photos' AND
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id::text = auth.uid()::text
    AND user_roles.role = 'admin'
  )
);
