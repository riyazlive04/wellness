-- Supersede previous community RLS migrations
-- Fixes missing INSERT policies and consolidates security for community features
-- Includes explicit type casting to prevent uuid = text errors

-- 1. community_posts
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read posts" ON public.community_posts;
DROP POLICY IF EXISTS "Authors can insert posts" ON public.community_posts;
DROP POLICY IF EXISTS "Authors can update own posts" ON public.community_posts;
DROP POLICY IF EXISTS "Authors can delete their own posts" ON public.community_posts;
DROP POLICY IF EXISTS "Admins can manage all posts" ON public.community_posts;
DROP POLICY IF EXISTS "Authors and Admins can delete posts" ON public.community_posts;

-- SELECT: Allow all authenticated users to read public posts
CREATE POLICY "Authenticated users can read posts"
ON public.community_posts FOR SELECT
TO authenticated
USING (true);

-- INSERT: Allow authenticated users to insert if they are the author
CREATE POLICY "Authors can insert posts"
ON public.community_posts FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid()::text = (SELECT user_id::text FROM public.clients WHERE id = author_client_id)
);

-- UPDATE: Allow authors to update their own posts
CREATE POLICY "Authors can update own posts"
ON public.community_posts FOR UPDATE
TO authenticated
USING (
  auth.uid()::text = (SELECT user_id::text FROM public.clients WHERE id = author_client_id)
)
WITH CHECK (
  auth.uid()::text = (SELECT user_id::text FROM public.clients WHERE id = author_client_id)
);

-- DELETE: Allow authors to delete (or admins)
CREATE POLICY "Authors and Admins can delete posts"
ON public.community_posts FOR DELETE
TO authenticated
USING (
  auth.uid()::text = (SELECT user_id::text FROM public.clients WHERE id = author_client_id)
  OR public.is_admin()
);


-- 2. community_comments
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read comments" ON public.community_comments;
DROP POLICY IF EXISTS "Authors can insert comments" ON public.community_comments;
DROP POLICY IF EXISTS "Authors can delete their own comments" ON public.community_comments;
DROP POLICY IF EXISTS "Authors, Post Authors, Admins can delete comments" ON public.community_comments;

-- SELECT
CREATE POLICY "Authenticated users can read comments"
ON public.community_comments FOR SELECT
TO authenticated
USING (true);

-- INSERT
CREATE POLICY "Authors can insert comments"
ON public.community_comments FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid()::text = (SELECT user_id::text FROM public.clients WHERE id = author_client_id)
);

-- DELETE (Author of comment, Author of parent post, or Admin)
CREATE POLICY "Authors, Post Authors, Admins can delete comments"
ON public.community_comments FOR DELETE
TO authenticated
USING (
  auth.uid()::text = (SELECT user_id::text FROM public.clients WHERE id = author_client_id)
  OR auth.uid()::text = (
    SELECT c.user_id::text 
    FROM public.clients c
    JOIN public.community_posts p ON p.author_client_id = c.id
    WHERE p.id = community_comments.post_id
  )
  OR public.is_admin()
);


-- 3. community_messages (DMs)
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own messages" ON public.community_messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.community_messages;
DROP POLICY IF EXISTS "Admins can view all messages" ON public.community_messages;

-- SELECT: Sender or Receiver
CREATE POLICY "Users can view their own messages"
ON public.community_messages FOR SELECT
TO authenticated
USING (
  auth.uid()::text = (SELECT user_id::text FROM public.clients WHERE id = sender_client_id)
  OR auth.uid()::text = (SELECT user_id::text FROM public.clients WHERE id = receiver_client_id)
  OR public.is_admin()
);

-- INSERT: Sender only
CREATE POLICY "Users can send messages"
ON public.community_messages FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid()::text = (SELECT user_id::text FROM public.clients WHERE id = sender_client_id)
);


-- 4. community_reactions
ALTER TABLE public.community_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read reactions" ON public.community_reactions;
DROP POLICY IF EXISTS "Users can manage their reactions" ON public.community_reactions;

-- SELECT
CREATE POLICY "Authenticated users can read reactions"
ON public.community_reactions FOR SELECT
TO authenticated
USING (true);

-- INSERT/UPDATE/DELETE
CREATE POLICY "Users can manage their reactions"
ON public.community_reactions FOR ALL
TO authenticated
USING (
  auth.uid()::text = (SELECT user_id::text FROM public.clients WHERE id = client_id)
)
WITH CHECK (
  auth.uid()::text = (SELECT user_id::text FROM public.clients WHERE id = client_id)
);
