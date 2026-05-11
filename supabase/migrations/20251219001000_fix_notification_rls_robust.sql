-- Fix RLS for push_subscriptions with robust type casting
-- Run this in Supabase SQL Editor

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can delete their own subscriptions" ON public.push_subscriptions;

-- We cast user_id to text to avoid "operator does not exist: text = uuid"
-- We also ensure id is returned as uuid for the IN clause

-- 1. View
CREATE POLICY "Users can view their own subscriptions"
ON public.push_subscriptions FOR SELECT TO authenticated
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id::text = auth.uid()::text
  )
);

-- 2. Insert
CREATE POLICY "Users can insert their own subscriptions"
ON public.push_subscriptions FOR INSERT TO authenticated
WITH CHECK (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id::text = auth.uid()::text
  )
);

-- 3. Update
CREATE POLICY "Users can update their own subscriptions"
ON public.push_subscriptions FOR UPDATE TO authenticated
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id::text = auth.uid()::text
  )
);

-- 4. Delete
CREATE POLICY "Users can delete their own subscriptions"
ON public.push_subscriptions FOR DELETE TO authenticated
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id::text = auth.uid()::text
  )
);
