-- Drop potentially conflicting or restrictive policies
DROP POLICY IF EXISTS "Clients can insert their own messages" ON public.messages;

-- Create a robust INSERT policy for clients
CREATE POLICY "Clients can insert their own messages"
ON public.messages
FOR INSERT
WITH CHECK (
  -- Ensure the sender is the authenticated user (CASTING to text to avoid type mismatch)
  auth.uid()::text = sender_id::text 
  -- Ensure type is client
  AND sender_type = 'client'
  -- Ensure the message is linked to the correct client record owned by the user
  AND EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = messages.client_id
    AND clients.user_id::text = auth.uid()::text
  )
);

-- Ensure clients can view their own messages ( SELECT )
-- This effectively replaces "Clients can view their own messages" if it was too restrictive, but we'll use a new name to be safe or REPLACE if supported (Postgres policies don't support OR REPLACE directly, so we drop if exists)
DROP POLICY IF EXISTS "Clients can view their own messages" ON public.messages;

CREATE POLICY "Clients can view their own messages"
ON public.messages
FOR SELECT
USING (
  -- Allow if the client_id matches a client record owned by the user
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = messages.client_id
    AND clients.user_id::text = auth.uid()::text
  )
);
