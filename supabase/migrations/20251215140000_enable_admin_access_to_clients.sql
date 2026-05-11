-- Enable RLS on clients if not already enabled
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Allow Admins to perform ALL operations on clients
-- This covers SELECT, INSERT, UPDATE, DELETE
DROP POLICY IF EXISTS "Admins can manage all clients" ON public.clients;

CREATE POLICY "Admins can manage all clients"
ON public.clients
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- Ensure authenticated users can still read their own client record
DROP POLICY IF EXISTS "Users can view own client record" ON public.clients;

CREATE POLICY "Users can view own client record"
ON public.clients
FOR SELECT
USING (auth.uid() = user_id);

-- Ensure users can update their own client record
DROP POLICY IF EXISTS "Users can update own client record" ON public.clients;

CREATE POLICY "Users can update own client record"
ON public.clients
FOR UPDATE
USING (auth.uid() = user_id);
