-- Fix type mismatch in is_admin function
-- user_roles.user_id is TEXT, but auth.uid() returns UUID
-- We need to cast auth.uid() to text for the comparison

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()::text -- Explicit cast to text
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
