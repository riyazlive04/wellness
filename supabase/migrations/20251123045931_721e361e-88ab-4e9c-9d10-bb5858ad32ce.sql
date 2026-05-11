-- Promote existing user to admin
UPDATE public.user_roles 
SET role = 'admin' 
WHERE user_id = '08dfe6a2-ab39-4048-a4de-03b0d9bc7f3c';

-- Create function to count admins
CREATE OR REPLACE FUNCTION public.count_admins()
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT count(*)
  FROM public.user_roles
  WHERE role = 'admin'
$$;

-- Update handle_new_user to make first user admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  admin_count bigint;
BEGIN
  -- Insert into profiles
  INSERT INTO public.profiles (id, name, email, phone)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', ''),
    new.email,
    COALESCE(new.raw_user_meta_data->>'phone', '')
  );
  
  -- Check if any admins exist
  SELECT count_admins() INTO admin_count;
  
  -- Assign admin role if first user, otherwise client role
  IF admin_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'client');
  END IF;
  
  RETURN new;
END;
$$;