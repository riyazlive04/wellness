-- Fix storage RLS by enforcing TEXT comparisons for owner
-- The error "operator does not exist: text = uuid" suggests storage.objects.owner might be TEXT (or being treated as such)

-- 1. Drop existing policies to be safe
DROP POLICY IF EXISTS "Authenticated users can upload meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view meal photos" ON storage.objects;

-- 2. Recreate policies utilizing explicit casting to TEXT for comparisons.
-- This handles cases where owner is TEXT or UUID safely.

-- INSERT POLICY
CREATE POLICY "Authenticated users can upload meal photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'meal-photos' AND
  (auth.uid()::text = owner::text) AND -- Explicit cast to avoid type mismatch
  public.is_own_client((storage.foldername(name))[1])
);

-- SELECT POLICY
CREATE POLICY "Authenticated users can view meal photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'meal-photos' AND
  (
    (auth.uid()::text = owner::text) OR -- Explicit cast
    public.is_own_client((storage.foldername(name))[1])
  )
);
