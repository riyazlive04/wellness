-- Fix RLS for push_subscriptions
-- Run this in Supabase SQL Editor

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can delete their own subscriptions" ON public.push_subscriptions;

-- Policy for SELECT
CREATE POLICY "Users can view their own subscriptions"
ON public.push_subscriptions
FOR SELECT
TO authenticated
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()::uuid
  )
);

-- Policy for INSERT
CREATE POLICY "Users can insert their own subscriptions"
ON public.push_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()::uuid
  )
);

-- Policy for UPDATE
CREATE POLICY "Users can update their own subscriptions"
ON public.push_subscriptions
FOR UPDATE
TO authenticated
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()::uuid
  )
);

-- Policy for DELETE
CREATE POLICY "Users can delete their own subscriptions"
ON public.push_subscriptions
FOR DELETE
TO authenticated
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()::uuid
  )
);
