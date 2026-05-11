-- Fix Community RLS policies to safely use public.is_admin()

-- 1. community_posts
DROP POLICY IF EXISTS "Admins can manage all posts" ON public.community_posts;
CREATE POLICY "Admins can manage all posts"
ON public.community_posts FOR ALL
USING (public.is_admin());

-- 2. community_comments
DROP POLICY IF EXISTS "Admins can manage all comments" ON public.community_comments;
CREATE POLICY "Admins can manage all comments"
ON public.community_comments FOR ALL
USING (public.is_admin());

-- 3. community_reactions
DROP POLICY IF EXISTS "Admins can manage all reactions" ON public.community_reactions;
CREATE POLICY "Admins can manage all reactions"
ON public.community_reactions FOR ALL
USING (public.is_admin());

-- 4. community_reports
DROP POLICY IF EXISTS "Admins can manage all reports" ON public.community_reports;
CREATE POLICY "Admins can manage all reports"
ON public.community_reports FOR ALL
USING (public.is_admin());

-- 5. community_messages
DROP POLICY IF EXISTS "Admins can view all messages" ON public.community_messages;
CREATE POLICY "Admins can view all messages"
ON public.community_messages FOR SELECT
USING (public.is_admin());

-- 6. community_notifications
DROP POLICY IF EXISTS "Admins can manage all notifications" ON public.community_notifications;
CREATE POLICY "Admins can manage all notifications"
ON public.community_notifications FOR ALL
USING (public.is_admin());

-- 7. community_groups
DROP POLICY IF EXISTS "Admins can manage all groups" ON public.community_groups;
CREATE POLICY "Admins can manage all groups"
ON public.community_groups FOR ALL
USING (public.is_admin());

-- 8. community_group_members
DROP POLICY IF EXISTS "Admins can manage all memberships" ON public.community_group_members;
CREATE POLICY "Admins can manage all memberships"
ON public.community_group_members FOR ALL
USING (public.is_admin());
