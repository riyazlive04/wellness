-- Comprehensive fix for Meal Photos Storage RLS
-- Resolves "row-level security policy" errors during upload

-- 1. Ensure the bucket calls 'meal-photos' exists and is private
INSERT INTO storage.buckets (id, name, public)
VALUES ('meal-photos', 'meal-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2. Drop all conflicting policies on storage.objects to start clean
DROP POLICY IF EXISTS "Authenticated users can upload meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all meal photos" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder 1u5b30_0" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder 1u5b30_1" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder 1u5b30_2" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder 1u5b30_3" ON storage.objects;

-- 3. Redefine helper function with extreme robustness
CREATE OR REPLACE FUNCTION public.is_own_client(_client_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client_uuid uuid;
BEGIN
  -- 1. Validate Input
  IF _client_id IS NULL OR _client_id = 'undefined' THEN
    RETURN false;
  END IF;

  -- 2. Try cast to UUID
  BEGIN
    _client_uuid := _client_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  -- 3. Check ownership
  -- Allows access if the Client ID exists and belongs to the current Auth User
  RETURN EXISTS (
    SELECT 1
    FROM public.clients
    WHERE id = _client_uuid
    AND user_id = auth.uid()
  );
END;
$$;

-- 4. Create Simplified & Robust Policies

-- INSERT: Allow if it's your client folder OR you are an admin
CREATE POLICY "Authenticated users can upload meal photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'meal-photos' AND
  (
    public.is_own_client((storage.foldername(name))[1]) 
    OR 
    public.is_admin()
  )
);

-- SELECT: Allow if it's your client folder OR you are an admin
CREATE POLICY "Authenticated users can view meal photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'meal-photos' AND
  (
    public.is_own_client((storage.foldername(name))[1]) 
    OR 
    public.is_admin()
  )
);

-- UPDATE: Allow if it's your client folder OR you are an admin
CREATE POLICY "Authenticated users can update meal photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'meal-photos' AND
  (
    public.is_own_client((storage.foldername(name))[1]) 
    OR 
    public.is_admin()
  )
);

-- DELETE: Allow if it's your client folder OR you are an admin
CREATE POLICY "Authenticated users can delete meal photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'meal-photos' AND
  (
    public.is_own_client((storage.foldername(name))[1]) 
    OR 
    public.is_admin()
  )
);

-- 5. Helper verification for generic 'authenticated' usage
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_own_client TO authenticated;
