-- Allow all authenticated users to read posts (so they persist/load)
DROP POLICY IF EXISTS "Authenticated users can read posts" ON public.community_posts;
CREATE POLICY "Authenticated users can read posts"
ON public.community_posts FOR SELECT
TO authenticated
USING (true);

-- Allow authors to delete their own posts
DROP POLICY IF EXISTS "Authors can delete their own posts" ON public.community_posts;
CREATE POLICY "Authors can delete their own posts"
ON public.community_posts FOR DELETE
TO authenticated
USING (auth.uid() = (
  SELECT user_id FROM public.clients WHERE id = author_client_id
));

-- Allow all authenticated users to view groups
DROP POLICY IF EXISTS "Authenticated users can view groups" ON public.community_groups;
CREATE POLICY "Authenticated users can view groups"
ON public.community_groups FOR SELECT
TO authenticated
USING (true);

-- Allow all authenticated users to view group members
DROP POLICY IF EXISTS "Authenticated users can view group members" ON public.community_group_members;
CREATE POLICY "Authenticated users can view group members"
ON public.community_group_members FOR SELECT
TO authenticated
USING (true);
