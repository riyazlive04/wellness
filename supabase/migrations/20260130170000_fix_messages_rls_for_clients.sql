-- Fix RLS for messages so clients can view their own messages
-- The previous policy relied on is_own_client logic which might be failing or too restrictive
-- This new policy explicitly checks against the clients table

-- 1. SELECT Policy
DROP POLICY IF EXISTS "Clients can view their own messages" ON public.messages;

CREATE POLICY "Clients can view their own messages"
ON public.messages FOR SELECT
USING (
  -- Allow if the message is for a client owned by the current user
  client_id::text IN (
    SELECT id::text FROM public.clients 
    WHERE user_id::text = auth.uid()::text
  )
);

-- 2. INSERT Policy
DROP POLICY IF EXISTS "Clients can insert their own messages" ON public.messages;

CREATE POLICY "Clients can insert their own messages"
ON public.messages FOR INSERT
WITH CHECK (
  -- Allow if the message is for a client owned by the current user
  client_id::text IN (
    SELECT id::text FROM public.clients 
    WHERE user_id::text = auth.uid()::text
  )
);
