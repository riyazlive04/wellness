-- Create service_type enum
CREATE TYPE public.service_type AS ENUM (
  'consultation',
  'hundred_days'
);

-- Add service_type column to clients table
ALTER TABLE public.clients 
ADD COLUMN service_type public.service_type DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.clients.service_type IS 'Service program: consultation (One-Time) or hundred_days (100-Days Program). Set by admin only.';

-- Update RLS policy to ensure clients cannot update their service_type
-- Drop the existing update policy and recreate it with explicit column restrictions
DROP POLICY IF EXISTS "Clients can update their own data" ON public.clients;

CREATE POLICY "Clients can update their own data" 
ON public.clients 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id AND
  -- Ensure service_type cannot be changed by clients
  service_type IS NOT DISTINCT FROM (SELECT service_type FROM public.clients WHERE id = clients.id)
);