-- Add display_name to clients table for community profiles
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS opt_in_directory boolean DEFAULT true;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS community_banned boolean DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS community_terms_accepted_at timestamp with time zone;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS badges jsonb DEFAULT '[]'::jsonb;

-- Create enums for community
CREATE TYPE public.community_visibility AS ENUM ('public', 'archived');
CREATE TYPE public.community_reaction_type AS ENUM ('like', 'love', 'celebrate');
CREATE TYPE public.community_target_type AS ENUM ('post', 'comment', 'user');
CREATE TYPE public.community_report_status AS ENUM ('open', 'reviewed', 'actioned');
CREATE TYPE public.community_notification_type AS ENUM ('comment', 'reaction', 'dm', 'moderation_action', 'group_invite', 'mention');
CREATE TYPE public.community_group_role AS ENUM ('member', 'moderator', 'owner');

-- Community Posts table
CREATE TABLE public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  author_display_name text NOT NULL,
  author_service_type text,
  group_id uuid,
  title text,
  content text NOT NULL,
  media_urls jsonb DEFAULT '[]'::jsonb,
  attachments jsonb DEFAULT '[]'::jsonb,
  tags jsonb DEFAULT '[]'::jsonb,
  likes_count integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  pinned boolean DEFAULT false,
  visibility public.community_visibility DEFAULT 'public',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT content_length CHECK (char_length(content) <= 1000),
  CONSTRAINT title_length CHECK (title IS NULL OR char_length(title) <= 150)
);

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

-- Community Comments table
CREATE TABLE public.community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  author_display_name text NOT NULL,
  author_service_type text,
  content text NOT NULL,
  likes_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT comment_length CHECK (char_length(content) <= 500)
);

ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

-- Community Reactions table
CREATE TABLE public.community_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  target_type public.community_target_type NOT NULL,
  target_id uuid NOT NULL,
  reaction public.community_reaction_type NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(client_id, target_type, target_id)
);

ALTER TABLE public.community_reactions ENABLE ROW LEVEL SECURITY;

-- Community Reports table
CREATE TABLE public.community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  target_type public.community_target_type NOT NULL,
  target_id uuid NOT NULL,
  reason text NOT NULL,
  status public.community_report_status DEFAULT 'open',
  admin_notes text,
  created_at timestamp with time zone DEFAULT now(),
  reviewed_at timestamp with time zone
);

ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

-- Community Messages (DMs) table
CREATE TABLE public.community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  receiver_client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  content text NOT NULL,
  media_urls jsonb DEFAULT '[]'::jsonb,
  sender_service_type_snapshot text,
  receiver_service_type_snapshot text,
  is_read boolean DEFAULT false,
  deleted boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT dm_content_length CHECK (char_length(content) <= 2000)
);

ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

-- Community Notifications table
CREATE TABLE public.community_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type public.community_notification_type NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;

-- Community Groups table
CREATE TABLE public.community_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  cover_image_url text,
  is_private boolean DEFAULT false,
  owner_client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  moderator_ids jsonb DEFAULT '[]'::jsonb,
  member_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.community_groups ENABLE ROW LEVEL SECURITY;

-- Community Group Members table
CREATE TABLE public.community_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  role public.community_group_role DEFAULT 'member',
  status text DEFAULT 'active',
  joined_at timestamp with time zone DEFAULT now(),
  UNIQUE(group_id, client_id)
);

ALTER TABLE public.community_group_members ENABLE ROW LEVEL SECURITY;

-- Community Audit Logs table
CREATE TABLE public.community_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  actor_admin_id uuid,
  action text NOT NULL,
  target_table text NOT NULL,
  target_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.community_audit_logs ENABLE ROW LEVEL SECURITY;

-- Rate limiting table
CREATE TABLE public.community_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  action_date date NOT NULL DEFAULT CURRENT_DATE,
  count integer DEFAULT 1,
  UNIQUE(client_id, action_type, action_date)
);

ALTER TABLE public.community_rate_limits ENABLE ROW LEVEL SECURITY;

-- Add foreign key for group_id in posts
ALTER TABLE public.community_posts 
ADD CONSTRAINT community_posts_group_id_fkey 
FOREIGN KEY (group_id) REFERENCES public.community_groups(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX idx_community_posts_author ON public.community_posts(author_client_id);
CREATE INDEX idx_community_posts_group ON public.community_posts(group_id);
CREATE INDEX idx_community_posts_created ON public.community_posts(created_at DESC);
CREATE INDEX idx_community_posts_visibility ON public.community_posts(visibility);
CREATE INDEX idx_community_comments_post ON public.community_comments(post_id);
CREATE INDEX idx_community_reactions_target ON public.community_reactions(target_type, target_id);
CREATE INDEX idx_community_messages_sender ON public.community_messages(sender_client_id);
CREATE INDEX idx_community_messages_receiver ON public.community_messages(receiver_client_id);
CREATE INDEX idx_community_notifications_client ON public.community_notifications(client_id, read);
CREATE INDEX idx_community_group_members_group ON public.community_group_members(group_id);
CREATE INDEX idx_community_group_members_client ON public.community_group_members(client_id);

-- RLS Policies for community_posts
CREATE POLICY "Anyone can view public posts"
ON public.community_posts FOR SELECT
USING (visibility = 'public');

CREATE POLICY "Authenticated users can create posts"
ON public.community_posts FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM clients WHERE clients.id = community_posts.author_client_id AND clients.user_id = auth.uid() AND clients.community_banned = false)
);

CREATE POLICY "Authors can update their posts"
ON public.community_posts FOR UPDATE
USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = community_posts.author_client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Admins can manage all posts"
ON public.community_posts FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for community_comments
CREATE POLICY "Anyone can view comments on public posts"
ON public.community_comments FOR SELECT
USING (EXISTS (SELECT 1 FROM community_posts WHERE community_posts.id = community_comments.post_id AND community_posts.visibility = 'public'));

CREATE POLICY "Authenticated users can create comments"
ON public.community_comments FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM clients WHERE clients.id = community_comments.author_client_id AND clients.user_id = auth.uid() AND clients.community_banned = false)
);

CREATE POLICY "Authors can delete their comments"
ON public.community_comments FOR DELETE
USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = community_comments.author_client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Admins can manage all comments"
ON public.community_comments FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for community_reactions
CREATE POLICY "Anyone can view reactions"
ON public.community_reactions FOR SELECT
USING (true);

CREATE POLICY "Users can manage their reactions"
ON public.community_reactions FOR ALL
USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = community_reactions.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Admins can manage all reactions"
ON public.community_reactions FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for community_reports
CREATE POLICY "Users can create reports"
ON public.community_reports FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = community_reports.reporter_client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Users can view their own reports"
ON public.community_reports FOR SELECT
USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = community_reports.reporter_client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Admins can manage all reports"
ON public.community_reports FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for community_messages (DMs)
CREATE POLICY "Users can view their own messages"
ON public.community_messages FOR SELECT
USING (
  EXISTS (SELECT 1 FROM clients WHERE clients.id = community_messages.sender_client_id AND clients.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM clients WHERE clients.id = community_messages.receiver_client_id AND clients.user_id = auth.uid())
);

CREATE POLICY "Active 100-day members can send messages"
ON public.community_messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clients 
    WHERE clients.id = community_messages.sender_client_id 
    AND clients.user_id = auth.uid() 
    AND clients.service_type = 'hundred_days' 
    AND clients.status = 'active'
    AND clients.community_banned = false
  )
  AND EXISTS (
    SELECT 1 FROM clients 
    WHERE clients.id = community_messages.receiver_client_id 
    AND clients.service_type = 'hundred_days' 
    AND clients.status = 'active'
  )
);

CREATE POLICY "Admins can view all messages"
ON public.community_messages FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for community_notifications
CREATE POLICY "Users can view their own notifications"
ON public.community_notifications FOR SELECT
USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = community_notifications.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Users can update their own notifications"
ON public.community_notifications FOR UPDATE
USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = community_notifications.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "System can create notifications"
ON public.community_notifications FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can manage all notifications"
ON public.community_notifications FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for community_groups
CREATE POLICY "Anyone can view public groups"
ON public.community_groups FOR SELECT
USING (community_groups.is_private = false OR EXISTS (
  SELECT 1 FROM community_group_members cgm 
  JOIN clients c ON c.id = cgm.client_id 
  WHERE cgm.group_id = community_groups.id AND c.user_id = auth.uid()
));

CREATE POLICY "Authenticated users can create groups"
ON public.community_groups FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = community_groups.owner_client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Group owners can update their groups"
ON public.community_groups FOR UPDATE
USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = community_groups.owner_client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Admins can manage all groups"
ON public.community_groups FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for community_group_members
CREATE POLICY "Members can view group membership"
ON public.community_group_members FOR SELECT
USING (true);

CREATE POLICY "Users can join public groups"
ON public.community_group_members FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM clients WHERE clients.id = community_group_members.client_id AND clients.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM community_groups WHERE community_groups.id = community_group_members.group_id AND community_groups.is_private = false)
);

CREATE POLICY "Users can leave groups"
ON public.community_group_members FOR DELETE
USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = community_group_members.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Admins can manage all memberships"
ON public.community_group_members FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for community_audit_logs
CREATE POLICY "Admins can view audit logs"
ON public.community_audit_logs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can create audit logs"
ON public.community_audit_logs FOR INSERT
WITH CHECK (true);

-- RLS Policies for community_rate_limits
CREATE POLICY "Users can view their own rate limits"
ON public.community_rate_limits FOR SELECT
USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = community_rate_limits.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "System can manage rate limits"
ON public.community_rate_limits FOR ALL
USING (true);

-- Function to update post counts
CREATE OR REPLACE FUNCTION public.update_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts SET comments_count = comments_count - 1 WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for comment count
CREATE TRIGGER update_comment_count
AFTER INSERT OR DELETE ON public.community_comments
FOR EACH ROW EXECUTE FUNCTION public.update_post_comment_count();

-- Function to update reaction counts
CREATE OR REPLACE FUNCTION public.update_reaction_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.target_type = 'post' THEN
      UPDATE community_posts SET likes_count = likes_count + 1 WHERE id = NEW.target_id;
    ELSIF NEW.target_type = 'comment' THEN
      UPDATE community_comments SET likes_count = likes_count + 1 WHERE id = NEW.target_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.target_type = 'post' THEN
      UPDATE community_posts SET likes_count = likes_count - 1 WHERE id = OLD.target_id;
    ELSIF OLD.target_type = 'comment' THEN
      UPDATE community_comments SET likes_count = likes_count - 1 WHERE id = OLD.target_id;
    END IF;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for reaction count
CREATE TRIGGER update_reaction_count_trigger
AFTER INSERT OR DELETE ON public.community_reactions
FOR EACH ROW EXECUTE FUNCTION public.update_reaction_count();

-- Function to update group member count
CREATE OR REPLACE FUNCTION public.update_group_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_groups SET member_count = member_count + 1 WHERE id = NEW.group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_groups SET member_count = member_count - 1 WHERE id = OLD.group_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for member count
CREATE TRIGGER update_member_count
AFTER INSERT OR DELETE ON public.community_group_members
FOR EACH ROW EXECUTE FUNCTION public.update_group_member_count();

-- Enable realtime for community tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;