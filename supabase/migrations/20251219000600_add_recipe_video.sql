-- Add video_url column to recipes table
ALTER TABLE public.recipes 
ADD COLUMN IF NOT EXISTS video_url text;

-- Ensure RLS allows clients to view recipes
-- (Assuming an existing policy might not cover it, or just to be safe)
-- We'll check if table has RLS enabled first
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

-- Creating a policy for authenticated users (clients and admins) to view recipes
-- Using DROP POLICY IF EXISTS to avoid errors if it already exists with a different name or same name
DROP POLICY IF EXISTS "Authenticated users can select recipes" ON public.recipes;

CREATE POLICY "Authenticated users can select recipes"
ON public.recipes
FOR SELECT
TO authenticated
USING (true);
