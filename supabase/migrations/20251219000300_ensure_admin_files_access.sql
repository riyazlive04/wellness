-- Drop potential existing policies to ensure clean slate for Admin SELECT
DROP POLICY IF EXISTS "Admins can view all files" ON public.files;
DROP POLICY IF EXISTS "Admins can view all files final" ON public.files;

-- Re-create the Admin SELECT policy with robust type casting
CREATE POLICY "Admins can view all files"
ON public.files FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id::text = auth.uid()::text AND role = 'admin')
);

-- Ensure RLS is enabled
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
