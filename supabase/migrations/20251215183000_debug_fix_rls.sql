-- Robust RLS Fix using Security Definer Function

-- 1. Create a Security Definer function to check client ownership
-- This function runs with the privileges of the owner (postgres), bypassing RLS on the clients table
-- allowing us to reliably check if the current user owns the client_id.

CREATE OR REPLACE FUNCTION public.is_own_client(_client_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the client_id belongs to the current authenticated user
  -- Try casting to UUID, return false if invalid
  BEGIN
    RETURN EXISTS (
      SELECT 1
      FROM public.clients
      WHERE id = _client_id::uuid
      AND user_id = auth.uid()
    );
  EXCEPTION WHEN substring_error OR invalid_text_representation THEN
    RETURN false;
  END;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_own_client(text) TO authenticated;

-- 2. Update Storage Policy for INSERT
DROP POLICY IF EXISTS "Authenticated users can upload meal photos" ON storage.objects;

CREATE POLICY "Authenticated users can upload meal photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'meal-photos' AND
  public.is_own_client((storage.foldername(name))[1])
);

-- Update Storage Policy for SELECT (View)
DROP POLICY IF EXISTS "Authenticated users can view meal photos" ON storage.objects;

CREATE POLICY "Authenticated users can view meal photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'meal-photos' AND
  public.is_own_client((storage.foldername(name))[1])
);

-- 3. Update Meal Logs Policies to use the function
DROP POLICY IF EXISTS "Clients can view their own meal logs" ON public.meal_logs;
drop policy if exists "Clients can insert their own meal logs" on public.meal_logs;
drop policy if exists "Clients can update their own meal logs" on public.meal_logs;
drop policy if exists "Clients can delete their own meal logs" on public.meal_logs;

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

-- 4. Ensure Clients table RLS is still correct (failsafe)
DROP POLICY IF EXISTS "Users can read own client profile" ON public.clients;
CREATE POLICY "Users can read own client profile"
ON public.clients
FOR SELECT
USING (auth.uid()::text = user_id::text);
