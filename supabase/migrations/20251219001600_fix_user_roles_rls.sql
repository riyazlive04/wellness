-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;

-- Create robust policies with STRICT text casting to avoid UUID/Text mismatch errors
CREATE POLICY "Users can read own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id::text = auth.uid()::text
);

CREATE POLICY "Admins can read all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  public.is_admin()
);
