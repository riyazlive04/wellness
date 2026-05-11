-- Fix RLS policies to allow user registration
-- Add INSERT policies for profiles and user_roles tables

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can read their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own role" ON public.user_roles;

-- Enable RLS on profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles table policies
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid()::text = id::text);

CREATE POLICY "Users can read their own profile"
ON public.profiles
FOR SELECT
USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid()::text = id::text);

-- User roles table policies
CREATE POLICY "Users can insert their own role"
ON public.user_roles
FOR INSERT
WITH CHECK (auth.uid()::text = user_id::text);

-- Grant necessary permissions
GRANT INSERT, SELECT, UPDATE ON public.profiles TO authenticated;
GRANT INSERT ON public.user_roles TO authenticated;
