-- Fix Storage RLS Type Mismatch Error

-- 1. Drop possibly problematic function to recreate it clean
-- usage of CASCADE is required because policies depend on it
DROP FUNCTION IF EXISTS public.is_own_client(text) CASCADE;

-- 2. Recreate Security Definer function with explicit casting checks
CREATE OR REPLACE FUNCTION public.is_own_client(_client_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client_uuid uuid;
BEGIN
  -- Attempt to cast to UUID first
  BEGIN
    _client_uuid := _client_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    -- If casting fails, it's definitely not a match for a UUID PK
    RETURN false;
  END;

  -- Perform the check using strict UUID comparisons
  -- clients.id is UUID
  -- clients.user_id is UUID
  -- auth.uid() returns UUID
  RETURN EXISTS (
    SELECT 1
    FROM public.clients
    WHERE id = _client_uuid
    AND user_id = auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_own_client(text) TO authenticated;

-- 3. Recreate Storage Policies (dropped by CASCADE or explicit drop)
-- We'll add a direct owner check as well, which is standard good practice

CREATE POLICY "Authenticated users can upload meal photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'meal-photos' AND
  auth.uid() = owner AND  -- Ensure the object is owned by the user (UUID = UUID)
  public.is_own_client((storage.foldername(name))[1]) -- Verify folder matches client ID
);

CREATE POLICY "Authenticated users can view meal photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'meal-photos' AND
  (
    auth.uid() = owner OR -- Check ownership directly
    public.is_own_client((storage.foldername(name))[1]) -- Or via folder path
  )
);

-- 4. Recreate Meal Logs Policies (dropped by CASCADE)
-- Policies for meal_logs were dependent on is_own_client, so they are gone now.
-- We must recreate them.

CREATE POLICY "Clients can view their own meal logs"
ON public.meal_logs FOR SELECT
USING ( public.is_own_client(client_id::text) );

CREATE POLICY "Clients can insert their own meal logs"
ON public.meal_logs FOR INSERT
WITH CHECK ( public.is_own_client(client_id::text) );

CREATE POLICY "Clients can update their own meal logs"
ON public.meal_logs FOR UPDATE
USING ( public.is_own_client(client_id::text) );

CREATE POLICY "Clients can delete their own meal logs"
ON public.meal_logs FOR DELETE
USING ( public.is_own_client(client_id::text) );
