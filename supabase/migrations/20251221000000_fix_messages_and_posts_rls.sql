-- 1. Messages table RLS hardening
DROP POLICY IF EXISTS "Clients can view their own messages" ON public.messages;
CREATE POLICY "Clients can view their own messages"
ON public.messages FOR SELECT
USING (public.is_own_client(client_id::text));

DROP POLICY IF EXISTS "Clients can insert their own messages" ON public.messages;
CREATE POLICY "Clients can insert their own messages"
ON public.messages FOR INSERT
WITH CHECK (public.is_own_client(client_id::text));

-- Ensure admins can always manage messages
DROP POLICY IF EXISTS "Admins can manage all messages_v2" ON public.messages;
CREATE POLICY "Admins can manage all messages_v2"
ON public.messages FOR ALL
USING (public.is_admin());

-- 2. Community Posts RLS hardening
DROP POLICY IF EXISTS "Anyone can view public posts" ON public.community_posts;
CREATE POLICY "Anyone can view public posts"
ON public.community_posts FOR SELECT
USING (visibility = 'public');

-- Ensure admins can always manage community posts
DROP POLICY IF EXISTS "Admins can manage all posts" ON public.community_posts;
CREATE POLICY "Admins can manage all posts"
ON public.community_posts FOR ALL
USING (public.is_admin());

-- 3. Community Messages (DMs) RLS hardening
DROP POLICY IF EXISTS "Users can view their own messages" ON public.community_messages;
CREATE POLICY "Users can view their own messages"
ON public.community_messages FOR SELECT
USING (
  public.is_own_client(sender_client_id::text)
  OR public.is_own_client(receiver_client_id::text)
);

-- Ensure admins can view all DMs
DROP POLICY IF EXISTS "Admins can view all messages" ON public.community_messages;
CREATE POLICY "Admins can view all messages"
ON public.community_messages FOR SELECT
USING (public.is_admin());

-- Re-enable realtime for these tables to be sure
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;
-- Note: Above may error if already in publication, so we use a safer way if possible or just ignore
