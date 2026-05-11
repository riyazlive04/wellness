-- Fix Admin Messaging and Visibility Issues

-- 1. Update Messages Table Policies
-- Drop existing Admin policies to be fresh
DROP POLICY IF EXISTS "Admins can view all messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can update messages" ON public.messages;

-- Re-create robust policies using direct table checks (avoiding potential recursion or function issues)
CREATE POLICY "Admins can view all messages"
ON public.messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id::text = auth.uid()::text 
    AND role::text = 'admin'
  )
);

CREATE POLICY "Admins can insert messages"
ON public.messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id::text = auth.uid()::text 
    AND role::text = 'admin'
  )
);

CREATE POLICY "Admins can update messages"
ON public.messages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id::text = auth.uid()::text 
    AND role::text = 'admin'
  )
);

-- 2. Update Bulk Message Batches Policies
-- Ensure admins can fully manage batches
DROP POLICY IF EXISTS "Admins can view all batches" ON public.bulk_message_batches;
DROP POLICY IF EXISTS "Admins can create batches" ON public.bulk_message_batches;
DROP POLICY IF EXISTS "Admins can update batches" ON public.bulk_message_batches;

CREATE POLICY "Admins can view all batches"
ON public.bulk_message_batches
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id::text = auth.uid()::text 
    AND role::text = 'admin'
  )
);

CREATE POLICY "Admins can create batches"
ON public.bulk_message_batches
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id::text = auth.uid()::text 
    AND role::text = 'admin'
  )
);

CREATE POLICY "Admins can update batches"
ON public.bulk_message_batches
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id::text = auth.uid()::text 
    AND role::text = 'admin'
  )
);

-- 3. Verify User Roles Policy
-- Ensure users can always see their own role (critical for the checks above)
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid()::text = user_id::text);

-- Ensure admins can see all roles (needed for has_role sometimes, but primarily for user management)
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles AS my_roles
    WHERE my_roles.user_id::text = auth.uid()::text 
    AND my_roles.role::text = 'admin'
  )
);
