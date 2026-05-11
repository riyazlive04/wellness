-- Consolidated RLS Fix for Meal Photo Uploads & Logs

-- 1. CLIENTS Table: Ensure Users can view their own client profile
-- This is critical because other policies rely on looking up client_id -> user_id
DROP POLICY IF EXISTS "Users can read own client profile" ON public.clients;
CREATE POLICY "Users can read own client profile"
ON public.clients
FOR SELECT
USING (auth.uid()::text = user_id::text);

-- 2. STORAGE: Meal Photos Bucket
-- Allow INSERT if the folder name matches a client ID that belongs to the authenticated user
DROP POLICY IF EXISTS "Authenticated users can upload meal photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload meal photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'meal-photos' AND
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id::text = (storage.foldername(name))[1]
    AND clients.user_id::text = auth.uid()::text
  )
);

-- Allow SELECT if the folder name matches a client ID that belongs to the authenticated user
DROP POLICY IF EXISTS "Authenticated users can view meal photos" ON storage.objects;
CREATE POLICY "Authenticated users can view meal photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'meal-photos' AND
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id::text = (storage.foldername(name))[1]
    AND clients.user_id::text = auth.uid()::text
  )
);

-- Allow Admins to view all meal photos
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

-- 3. MEAL LOGS Table
-- Consolidated policies for clients to manage their own logs
DROP POLICY IF EXISTS "Clients can view their own meal logs" ON public.meal_logs;
DROP POLICY IF EXISTS "Clients can insert their own meal logs" ON public.meal_logs;
DROP POLICY IF EXISTS "Clients can update their own meal logs" ON public.meal_logs;
DROP POLICY IF EXISTS "Clients can delete their own meal logs" ON public.meal_logs;

CREATE POLICY "Clients can view their own meal logs"
ON public.meal_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id::text = meal_logs.client_id::text
    AND clients.user_id::text = auth.uid()::text
  )
);

CREATE POLICY "Clients can insert their own meal logs"
ON public.meal_logs FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id::text = meal_logs.client_id::text
    AND clients.user_id::text = auth.uid()::text
  )
);

CREATE POLICY "Clients can update their own meal logs"
ON public.meal_logs FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id::text = meal_logs.client_id::text
    AND clients.user_id::text = auth.uid()::text
  )
);

CREATE POLICY "Clients can delete their own meal logs"
ON public.meal_logs FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id::text = meal_logs.client_id::text
    AND clients.user_id::text = auth.uid()::text
  )
);

-- Ensure Admins can view all meal logs
DROP POLICY IF EXISTS "Admins can view all meal logs" ON public.meal_logs;
CREATE POLICY "Admins can view all meal logs"
ON public.meal_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id::text = auth.uid()::text
    AND user_roles.role = 'admin'
  )
);
