import { supabase } from "@/integrations/supabase/client";

// Project public profile - NEVER expose email/phone
export interface PublicProfile {
  id: string;
  display_name: string;
  service_type: string | null;
  join_month_year: string;
  post_count: number;
  badges: string[];
}

export interface CommunityPost {
  id: string;
  author_client_id: string;
  author_display_name: string;
  author_service_type: string | null;
  group_id: string | null;
  title: string | null;
  content: string;
  media_urls: string[];
  attachments: { name: string; url: string; type: string }[];
  tags: string[];
  likes_count: number;
  comments_count: number;
  pinned: boolean;
  visibility: 'public' | 'archived';
  created_at: string;
  updated_at: string;
  author_role: 'admin' | 'client' | 'manager' | null;
  user_reaction?: 'like' | null;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  author_client_id: string;
  author_display_name: string;
  author_service_type: string | null;
  content: string;
  likes_count: number;
  created_at: string;
  author_role: 'admin' | 'client' | 'manager' | null;
  user_reaction?: 'like' | null;
}

export interface CommunityGroup {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_image_url: string | null;
  is_private: boolean;
  owner_client_id: string;
  member_count: number;
  created_at: string;
  is_member?: boolean;
}

export interface DirectMessage {
  id: string;
  sender_client_id: string;
  receiver_client_id: string;
  content: string;
  media_urls: string[];
  is_read: boolean;
  created_at: string;
  sender_display_name?: string;
}

export interface CommunityNotification {
  id: string;
  client_id: string;
  type: 'comment' | 'reaction' | 'dm' | 'moderation_action' | 'group_invite' | 'mention';
  payload: Record<string, any>;
  read: boolean;
  created_at: string;
}

// Rate limits
const RATE_LIMITS = {
  posts: 5,
  comments: 50,
  messages: 100,
};

export async function checkRateLimit(clientId: string, actionType: 'posts' | 'comments' | 'messages'): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('community_rate_limits')
    .select('count')
    .eq('client_id', clientId)
    .eq('action_type', actionType)
    .eq('action_date', today)
    .maybeSingle(); // Use maybeSingle to avoid 406/PGRST116 error if no row exists

  if (error && error.code !== 'PGRST116') {
    console.error("Rate limit check error:", error);
    // Be permissive on error to avoid blocking valid users due to system issues
    return true;
  }

  return !data || data.count < RATE_LIMITS[actionType];
}

export async function incrementRateLimit(clientId: string, actionType: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const { data: existing } = await supabase
    .from('community_rate_limits')
    .select('id, count')
    .eq('client_id', clientId)
    .eq('action_type', actionType)
    .eq('action_date', today)
    .single();

  if (existing) {
    await supabase
      .from('community_rate_limits')
      .update({ count: existing.count + 1 })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('community_rate_limits')
      .insert({
        client_id: clientId,
        action_type: actionType,
        action_date: today,
        count: 1,
      });
  }
}

// Fetch posts with pagination
export async function fetchPosts(options: {
  cursor?: string;
  tag?: string;
  serviceType?: string;
  search?: string;
  sort?: 'newest' | 'popular' | 'trending';
  groupId?: string;
  limit?: number;
  clientId?: string;
}): Promise<{ posts: CommunityPost[]; nextCursor: string | null }> {
  const limit = options.limit || 20;

  let query = supabase
    .from('community_posts')
    .select('*')
    .eq('visibility', 'public')
    .order(options.sort === 'popular' ? 'likes_count' : 'created_at', { ascending: false })
    .limit(limit);

  if (options.cursor) {
    query = query.lt('created_at', options.cursor);
  }

  if (options.groupId) {
    query = query.eq('group_id', options.groupId);
  }

  if (options.tag) {
    query = query.contains('tags', [options.tag]);
  }

  if (options.serviceType) {
    query = query.eq('author_service_type', options.serviceType);
  }

  if (options.search) {
    query = query.or(`content.ilike.%${options.search}%,title.ilike.%${options.search}%`);
  }

  const { data: posts, error } = await query;

  if (error) throw error;

  console.log(`Community: Fetched ${posts?.length} posts`);

  // Fetch user reactions if clientId provided
  let postsWithReactions = posts || [];
  if (options.clientId && posts?.length) {
    const { data: reactions } = await supabase
      .from('community_reactions')
      .select('target_id, reaction')
      .eq('client_id', options.clientId)
      .eq('target_type', 'post')
      .in('target_id', posts.map(p => p.id));

    const reactionMap = new Map(reactions?.map(r => [r.target_id, r.reaction]) || []);
    postsWithReactions = posts.map(p => ({
      ...p,
      media_urls: p.media_urls || [],
      attachments: p.attachments || [],
      tags: p.tags || [],
      user_reaction: reactionMap.get(p.id) || null,
    }));
  }

  const nextCursor = posts?.length === limit ? posts[posts.length - 1].created_at : null;

  return { posts: postsWithReactions as CommunityPost[], nextCursor };
}

// Create a post
export async function createPost(data: {
  clientId: string;
  displayName: string;
  serviceType: string | null;
  content: string;
  title?: string;
  tags?: string[];
  mediaUrls?: string[];
  attachments?: { name: string; url: string; type: string }[];
  groupId?: string;
  authorRole: 'admin' | 'client';
}): Promise<CommunityPost> {
  // Check rate limit
  const canPost = await checkRateLimit(data.clientId, 'posts');
  if (!canPost) {
    throw new Error('Daily post limit reached (5 posts per day)');
  }

  const { data: post, error } = await supabase
    .from('community_posts')
    .insert({
      author_client_id: data.clientId,
      author_display_name: data.displayName,
      author_service_type: data.serviceType,
      content: data.content.slice(0, 1000),
      title: data.title?.slice(0, 150) || null,
      tags: data.tags || [],
      media_urls: data.mediaUrls || [],
      attachments: data.attachments || [],
      group_id: data.groupId || null,
      author_role: data.authorRole,
      visibility: 'public',
    })
    .select()
    .single();

  if (error) throw error;

  await incrementRateLimit(data.clientId, 'posts');

  // Return with explicitly safe fields to match CommunityPost interface requirements
  return {
    ...post,
    media_urls: post.media_urls || [],
    attachments: post.attachments || [],
    tags: post.tags || [],
    likes_count: post.likes_count || 0,
    comments_count: post.comments_count || 0,
    user_reaction: null
  } as CommunityPost;
}

// Delete a post
export async function deletePost(postId: string, clientId: string): Promise<void> {
  // First verify ownership or admin status (handled by RLS, but doesn't hurt to check client-side too if we had the post data, but we rely on RLS)
  const { error } = await supabase
    .from('community_posts')
    .delete()
    .eq('id', postId);

  if (error) throw error;
}

// Create a comment
export async function createComment(data: {
  postId: string;
  clientId: string;
  displayName: string;
  serviceType: string | null;
  content: string;
  authorRole: 'admin' | 'client';
}): Promise<CommunityComment> {
  console.log("Community: Creating comment...", data);
  const canComment = await checkRateLimit(data.clientId, 'comments');
  if (!canComment) {
    throw new Error('Daily comment limit reached (50 comments per day)');
  }

  const { data: comment, error } = await supabase
    .from('community_comments')
    .insert({
      post_id: data.postId,
      author_client_id: data.clientId,
      author_display_name: data.displayName,
      author_service_type: data.serviceType,
      author_role: data.authorRole,
      content: data.content.slice(0, 500),
    })
    .select()
    .single();

  if (error) {
    console.error("Community: Comment insert failed:", error);
    throw error;
  }

  console.log("Community: Comment inserted successfully:", comment);

  await incrementRateLimit(data.clientId, 'comments');

  // Create notification for post author
  const { data: post } = await supabase
    .from('community_posts')
    .select('author_client_id')
    .eq('id', data.postId)
    .single();

  if (post && post.author_client_id !== data.clientId) {
    console.log("Community: Creating notification for author:", post.author_client_id);
    const { error: notifError } = await supabase.from('community_notifications').insert({
      client_id: post.author_client_id,
      type: 'comment',
      payload: {
        post_id: data.postId,
        comment_id: comment.id,
        commenter_name: data.displayName,
      },
    });

    if (notifError) {
      console.error("Community: Notification insert failed (non-blocking):", notifError);
    }
  }

  return {
    ...comment,
    likes_count: comment.likes_count || 0,
    user_reaction: null
  } as CommunityComment;
}

// Toggle reaction
export async function toggleReaction(
  clientId: string,
  targetType: 'post' | 'comment',
  targetId: string,
  reaction: 'like'
): Promise<{ added: boolean }> {
  console.log(`Community: Toggling reaction ${reaction} on ${targetType} ${targetId}`);

  // Check if reaction exists
  const { data: existing, error: fetchError } = await supabase
    .from('community_reactions')
    .select('id, reaction')
    .eq('client_id', clientId)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .maybeSingle();

  if (fetchError) {
    console.error("Community: Error checking existing reaction:", fetchError);
    // Proceeding to safely assume no reaction if error is not critical, or throwing?
    // Let's throw to be safe
    throw fetchError;
  }

  if (existing) {
    if (existing.reaction === reaction) {
      // Remove reaction
      console.log("Community: Removing existing reaction...");
      const { error: deleteError } = await supabase.from('community_reactions').delete().eq('id', existing.id);
      if (deleteError) {
        console.error("Community: Failed to delete reaction:", deleteError);
        throw deleteError;
      }
      return { added: false };
    } else {
      // Update reaction
      console.log("Community: Updating reaction...");
      const { error: updateError } = await supabase.from('community_reactions').update({ reaction }).eq('id', existing.id);
      if (updateError) {
        console.error("Community: Failed to update reaction:", updateError);
        throw updateError;
      }
      return { added: true };
    }
  } else {
    // Add reaction
    console.log("Community: Adding new reaction...");
    const { error: insertError } = await supabase.from('community_reactions').insert({
      client_id: clientId,
      target_type: targetType,
      target_id: targetId,
      reaction,
    });

    if (insertError) {
      console.error("Community: Failed to insert reaction:", insertError);
      throw insertError;
    }

    return { added: true };
  }
}

// Fetch comments for a post
export async function fetchComments(postId: string, clientId?: string): Promise<CommunityComment[]> {
  const { data: comments, error } = await supabase
    .from('community_comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  if (clientId && comments?.length) {
    const { data: reactions } = await supabase
      .from('community_reactions')
      .select('target_id, reaction')
      .eq('client_id', clientId)
      .eq('target_type', 'comment')
      .in('target_id', comments.map(c => c.id));

    const reactionMap = new Map(reactions?.map(r => [r.target_id, r.reaction]) || []);
    return comments.map(c => ({
      ...c,
      user_reaction: reactionMap.get(c.id) || null,
    })) as CommunityComment[];
  }

  return (comments || []) as CommunityComment[];
}

// Report content
export async function reportContent(
  reporterClientId: string,
  targetType: 'post' | 'comment' | 'user',
  targetId: string,
  reason: string
): Promise<void> {
  const { error } = await supabase.from('community_reports').insert({
    reporter_client_id: reporterClientId,
    target_type: targetType,
    target_id: targetId,
    reason,
  });

  if (error) throw error;
}

// Check DM eligibility
export async function canSendDM(senderClientId: string, receiverClientId: string): Promise<boolean> {
  const { data: sender } = await supabase
    .from('clients')
    .select('service_type, status, community_banned')
    .eq('id', senderClientId)
    .single();

  const { data: receiver } = await supabase
    .from('clients')
    .select('service_type, status')
    .eq('id', receiverClientId)
    .single();

  return (
    sender?.service_type === 'hundred_days' &&
    sender?.status === 'active' &&
    !sender?.community_banned &&
    receiver?.service_type === 'hundred_days' &&
    receiver?.status === 'active'
  );
}

// Send DM
export async function sendDirectMessage(
  senderClientId: string,
  receiverClientId: string,
  content: string,
  mediaUrls?: string[]
): Promise<DirectMessage> {
  const canSend = await canSendDM(senderClientId, receiverClientId);
  if (!canSend) {
    throw new Error('DMs are only available between active 100-day program members');
  }

  const canMessage = await checkRateLimit(senderClientId, 'messages');
  if (!canMessage) {
    throw new Error('Daily message limit reached (100 messages per day)');
  }

  // Get service types for snapshot
  const { data: sender } = await supabase
    .from('clients')
    .select('service_type')
    .eq('id', senderClientId)
    .single();

  const { data: receiver } = await supabase
    .from('clients')
    .select('service_type')
    .eq('id', receiverClientId)
    .single();

  const { data: message, error } = await supabase
    .from('community_messages')
    .insert({
      sender_client_id: senderClientId,
      receiver_client_id: receiverClientId,
      content: content.slice(0, 2000),
      media_urls: mediaUrls || [],
      sender_service_type_snapshot: sender?.service_type,
      receiver_service_type_snapshot: receiver?.service_type,
    })
    .select()
    .single();

  if (error) throw error;

  await incrementRateLimit(senderClientId, 'messages');

  // Create notification
  await supabase.from('community_notifications').insert({
    client_id: receiverClientId,
    type: 'dm',
    payload: {
      message_id: message.id,
      sender_client_id: senderClientId,
    },
  });

  return message as DirectMessage;
}

// Fetch conversations
export async function fetchConversations(clientId: string): Promise<{
  peerId: string;
  peerName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}[]> {
  const { data: messages, error } = await supabase
    .from('community_messages')
    .select('*')
    .or(`sender_client_id.eq.${clientId},receiver_client_id.eq.${clientId}`)
    .eq('deleted', false)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Group by peer
  const conversationMap = new Map<string, {
    peerId: string;
    lastMessage: string;
    lastMessageAt: string;
    unreadCount: number;
  }>();

  for (const msg of messages || []) {
    const peerId = msg.sender_client_id === clientId ? msg.receiver_client_id : msg.sender_client_id;

    if (!conversationMap.has(peerId)) {
      conversationMap.set(peerId, {
        peerId,
        lastMessage: msg.content,
        lastMessageAt: msg.created_at,
        unreadCount: 0,
      });
    }

    if (msg.receiver_client_id === clientId && !msg.is_read) {
      const conv = conversationMap.get(peerId)!;
      conv.unreadCount++;
    }
  }

  // Fetch peer names
  const peerIds = Array.from(conversationMap.keys());
  const { data: peers } = await supabase
    .from('clients')
    .select('id, display_name, name')
    .in('id', peerIds);

  const peerNameMap = new Map(peers?.map(p => [p.id, p.display_name || p.name]) || []);

  return Array.from(conversationMap.values()).map(conv => ({
    ...conv,
    peerName: peerNameMap.get(conv.peerId) || 'Unknown',
  }));
}

// Fetch messages with a peer
export async function fetchMessages(clientId: string, peerId: string): Promise<DirectMessage[]> {
  const { data: messages, error } = await supabase
    .from('community_messages')
    .select('*')
    .or(`and(sender_client_id.eq.${clientId},receiver_client_id.eq.${peerId}),and(sender_client_id.eq.${peerId},receiver_client_id.eq.${clientId})`)
    .eq('deleted', false)
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Mark as read
  await supabase
    .from('community_messages')
    .update({ is_read: true })
    .eq('receiver_client_id', clientId)
    .eq('sender_client_id', peerId)
    .eq('is_read', false);

  return (messages || []) as DirectMessage[];
}

// Fetch groups
export async function fetchGroups(clientId?: string): Promise<CommunityGroup[]> {
  const { data: groups, error } = await supabase
    .from('community_groups')
    .select('*')
    .order('member_count', { ascending: false });

  if (error) throw error;

  if (clientId && groups?.length) {
    const { data: memberships } = await supabase
      .from('community_group_members')
      .select('group_id')
      .eq('client_id', clientId);

    const memberGroupIds = new Set(memberships?.map(m => m.group_id) || []);

    return groups.map(g => ({
      ...g,
      is_member: memberGroupIds.has(g.id),
    })) as CommunityGroup[];
  }

  return (groups || []) as CommunityGroup[];
}

// Join group
export async function joinGroup(groupId: string, clientId: string): Promise<void> {
  const { error } = await supabase.from('community_group_members').insert({
    group_id: groupId,
    client_id: clientId,
    role: 'member',
  });

  if (error) throw error;
}

// Create group
export async function createGroup(data: {
  name: string;
  slug: string;
  description?: string;
  coverImageUrl?: string;
  isPrivate: boolean;
  ownerClientId: string;
}): Promise<CommunityGroup> {
  const { data: group, error } = await supabase
    .from('community_groups')
    .insert({
      name: data.name,
      slug: data.slug,
      description: data.description,
      cover_image_url: data.coverImageUrl,
      is_private: data.isPrivate,
      owner_client_id: data.ownerClientId,
    })
    .select()
    .single();

  if (error) throw error;

  // Add owner to group members
  const { error: memberError } = await supabase
    .from('community_group_members')
    .insert({
      group_id: group.id,
      client_id: data.ownerClientId,
      role: 'owner',
    });

  if (memberError) {
    console.error('Failed to add owner as member:', memberError);
  }

  return group as CommunityGroup;
}

// Delete group
export async function deleteGroup(groupId: string): Promise<void> {
  const { error } = await supabase
    .from('community_groups')
    .delete()
    .eq('id', groupId);

  if (error) throw error;
}

// Leave group
export async function leaveGroup(groupId: string, clientId: string): Promise<void> {
  const { error } = await supabase
    .from('community_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('client_id', clientId);

  if (error) throw error;
}

// Fetch notifications
export async function fetchNotifications(clientId: string): Promise<CommunityNotification[]> {
  const { data, error } = await supabase
    .from('community_notifications')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data || []) as CommunityNotification[];
}

// Mark notifications as read
export async function markNotificationsRead(clientId: string, notificationIds?: string[]): Promise<void> {
  let query = supabase
    .from('community_notifications')
    .update({ read: true })
    .eq('client_id', clientId);

  if (notificationIds?.length) {
    query = query.in('id', notificationIds);
  }

  await query;
}

// Get unread notification count
export async function getUnreadNotificationCount(clientId: string): Promise<number> {
  const { count, error } = await supabase
    .from('community_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('read', false);

  if (error) throw error;

  return count || 0;
}

// Project public profile helper
export function projectPublicProfile(client: any): PublicProfile {
  const createdAt = new Date(client.created_at);
  const joinMonthYear = `${createdAt.toLocaleString('default', { month: 'short' })} ${createdAt.getFullYear()}`;

  return {
    id: client.id,
    display_name: client.display_name || client.name?.split(' ')[0] || 'Member',
    service_type: client.service_type,
    join_month_year: joinMonthYear,
    post_count: client.post_count || 0,
    badges: client.badges || [],
  };
}

// Sanitize content
export function sanitizeContent(content: string): string {
  // Remove HTML tags
  let sanitized = content.replace(/<[^>]*>/g, '');
  // Remove script content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Trim whitespace
  return sanitized.trim();
}

// Get service type badge color
export function getServiceTypeBadgeColor(serviceType: string | null): string {
  switch (serviceType) {
    case 'hundred_days':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'consultation':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'alumni':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

// Format service type for display
export function formatServiceTypeForCommunity(serviceType: string | null): string {
  switch (serviceType) {
    case 'hundred_days':
      return '100 Days';
    case 'consultation':
      return 'Consultation';
    case 'alumni':
      return 'Alumni';
    default:
      return 'Member';
  }
}
