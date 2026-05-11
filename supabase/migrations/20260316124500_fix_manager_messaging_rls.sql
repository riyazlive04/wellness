-- Fix Manager Messaging and Access Permissions
-- This script updates RLS policies and constraints to allow 'manager' role

-- 0. Update Core Role Functions (Global Fix for Manager)
-- We update is_admin to return true for managers as well, satisfying existing 'admin' policies
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id::text = auth.uid()::text
    AND role::text IN ('admin', 'manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id::text = auth.uid()::text  
    AND role::text IN ('admin', 'manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1. Fix Constraints on Messages Table
-- The sender_type column has a check constraint that limits to ('system', 'admin', 'client')
-- We need to drop it and add 'manager'
DO $$ 
DECLARE 
    constraint_name TEXT;
BEGIN 
    SELECT conname INTO constraint_name
    FROM pg_constraint 
    WHERE conrelid = 'public.messages'::regclass 
    AND pg_get_constraintdef(oid) LIKE '%sender_type%IN%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.messages DROP CONSTRAINT ' || constraint_name;
    END IF;
END $$;

ALTER TABLE public.messages 
ADD CONSTRAINT messages_sender_type_check 
CHECK (sender_type IN ('system', 'admin', 'client', 'manager'));

-- 2. Update RLS Policies (Redundant but safe)
-- Messages Table
DROP POLICY IF EXISTS "Admins can manage all messages_v2" ON public.messages;
DROP POLICY IF EXISTS "Admins can manage all messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can view all messages" ON public.messages;

CREATE POLICY "Admins and Managers can manage all messages"
ON public.messages FOR ALL
USING (public.is_admin_or_manager());

-- Admin Notes Table
DROP POLICY IF EXISTS "Admins can manage all notes" ON public.admin_notes;
CREATE POLICY "Admins and Managers can manage all notes"
ON public.admin_notes FOR ALL
USING (public.is_admin_or_manager());

-- Clients Table
DROP POLICY IF EXISTS "Admins can manage all clients" ON public.clients;
CREATE POLICY "Admins and Managers can manage all clients"
ON public.clients FOR ALL
USING (public.is_admin_or_manager());
