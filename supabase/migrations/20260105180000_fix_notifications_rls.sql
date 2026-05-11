-- Ensure community_notifications table exists
CREATE TABLE IF NOT EXISTS public.community_notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  type text NOT NULL, -- 'comment', 'reaction', 'dm', etc.
  payload jsonb DEFAULT '{}'::jsonb,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can read own notifications" ON public.community_notifications;
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.community_notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.community_notifications;

-- SELECT: Users can read their own notifications
CREATE POLICY "Users can read own notifications"
ON public.community_notifications FOR SELECT
TO authenticated
USING (
  auth.uid()::text = (SELECT user_id::text FROM public.clients WHERE id = client_id)
);

-- INSERT: Any authenticated user can create a notification (e.g. for another user)
CREATE POLICY "Authenticated users can create notifications"
ON public.community_notifications FOR INSERT
TO authenticated
WITH CHECK (true);

-- UPDATE: Users can mark their own notifications as read
CREATE POLICY "Users can update own notifications"
ON public.community_notifications FOR UPDATE
TO authenticated
USING (
  auth.uid()::text = (SELECT user_id::text FROM public.clients WHERE id = client_id)
)
WITH CHECK (
  auth.uid()::text = (SELECT user_id::text FROM public.clients WHERE id = client_id)
);
