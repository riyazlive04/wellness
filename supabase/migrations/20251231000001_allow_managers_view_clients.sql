-- Allow Managers to View Clients
-- This grants managers read access to the clients table

-- Add policy for managers to view all clients (read-only)
CREATE POLICY "Managers can view all clients"
ON public.clients
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id::text = auth.uid()::text
    AND role = 'manager'
  )
);

-- Ensure managers can also view client statistics
GRANT SELECT ON public.clients TO authenticated;
