import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * NetworkService — the global "Nutritionist Network": a shared professional
 * feed across EVERY practice on SIRAH LIFE, at parity with the per-practice
 * community (multi-type reactions + comments). Intentionally NOT workspace
 * scoped. Reaction/comment reads are wrapped so the feed still works before
 * those tables have been created.
 */
export const REACTION_KEYS = ['cheer', 'strength', 'love', 'celebrate'] as const;
export type ReactionKey = (typeof REACTION_KEYS)[number];

@Injectable()
export class NetworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async feed(userId: string, opts: { following?: boolean } = {}): Promise<NetworkPost[]> {
    const posts = await this.prisma.$queryRawUnsafe<Array<{
      id: string; content: string; created_at: Date; author_user_id: string;
      practice_name: string | null; practice_display: string | null;
      author_email: string | null; author_role: string | null; image_url: string | null;
      author_is_following: boolean;
    }>>(
      `SELECT p.id, p.content, p.created_at, p.author_user_id,
              (to_jsonb(p) ->> 'image_url') AS image_url,
              w.name AS practice_name, w.display_name AS practice_display,
              u.email AS author_email, wm.role::text AS author_role,
              EXISTS(SELECT 1 FROM public.network_follows f
                      WHERE f.follower_user_id = $1::uuid AND f.following_user_id = p.author_user_id) AS author_is_following
         FROM public.network_posts p
         LEFT JOIN public.workspaces w ON w.id = p.author_workspace_id
         LEFT JOIN auth.users u ON u.id = p.author_user_id
         LEFT JOIN public.workspace_members wm
                ON wm.user_id = p.author_user_id AND wm.workspace_id = p.author_workspace_id
        ${opts.following ? `WHERE p.author_user_id IN (SELECT following_user_id FROM public.network_follows WHERE follower_user_id = $1::uuid)` : ''}
        ORDER BY p.created_at DESC
        LIMIT 100`,
      userId);
    if (!posts.length) return [];
    const ids = posts.map((p) => p.id);

    // Reactions + comments live in tables that may not exist yet — degrade to
    // empty rather than 500 so the feed keeps rendering before the migration.
    const reactionRows = await this.safe(() => this.prisma.$queryRawUnsafe<Array<{
      post_id: string; reaction: string; user_id: string;
      practice_name: string | null; practice_display: string | null; author_email: string | null; role: string | null;
    }>>(
      // Resolve each reactor's practice + role (their primary/owner workspace) so
      // the UI can show WHO reacted, not just a count.
      `SELECT r.post_id, r.reaction, r.user_id,
              w.name AS practice_name, w.display_name AS practice_display,
              u.email AS author_email, wm.role::text AS role
         FROM public.network_post_reactions r
         LEFT JOIN auth.users u ON u.id = r.user_id
         LEFT JOIN LATERAL (
           SELECT workspace_id, role FROM public.workspace_members
            WHERE user_id = r.user_id AND status = 'active'
            ORDER BY (role = 'owner') DESC, joined_at ASC LIMIT 1
         ) wm ON true
         LEFT JOIN public.workspaces w ON w.id = wm.workspace_id
        WHERE r.post_id = ANY($1::uuid[])`, ids), []);
    const commentRows = await this.safe(() => this.prisma.$queryRawUnsafe<Array<{
      id: string; post_id: string; content: string; created_at: Date; author_user_id: string;
      practice_name: string | null; practice_display: string | null; author_role: string | null;
    }>>(
      `SELECT c.id, c.post_id, c.content, c.created_at, c.author_user_id,
              w.name AS practice_name, w.display_name AS practice_display, wm.role::text AS author_role
         FROM public.network_comments c
         LEFT JOIN public.workspaces w ON w.id = c.author_workspace_id
         LEFT JOIN public.workspace_members wm
                ON wm.user_id = c.author_user_id AND wm.workspace_id = c.author_workspace_id
        WHERE c.post_id = ANY($1::uuid[])
        ORDER BY c.created_at ASC`, ids), []);

    return posts.map((p) => {
      const reactions = zeroReactions();
      const mine: ReactionKey[] = [];
      const reactors: NetworkReactor[] = [];
      for (const r of reactionRows) {
        if (r.post_id !== p.id) continue;
        const key = r.reaction as ReactionKey;
        if (!REACTION_KEYS.includes(key)) continue;
        reactions[key] += 1;
        if (r.user_id === userId && !mine.includes(key)) mine.push(key);
        reactors.push({
          user_id: r.user_id,
          reaction: key,
          practice: practiceName(r.practice_display, r.practice_name, r.author_email),
          role: r.role,
          mine: r.user_id === userId,
        });
      }
      const comments = commentRows
        .filter((c) => c.post_id === p.id)
        .map((c) => ({
          id: c.id,
          content: c.content,
          created_at: c.created_at.toISOString(),
          author_practice: practiceName(c.practice_display, c.practice_name, null),
          author_role: c.author_role,
          mine: c.author_user_id === userId,
        }));
      return {
        id: p.id,
        content: p.content,
        created_at: p.created_at.toISOString(),
        author_user_id: p.author_user_id,
        author_practice: practiceName(p.practice_display, p.practice_name, p.author_email),
        author_role: p.author_role,
        author_email: p.author_email,
        image_url: p.image_url ?? null,
        reactions,
        reacted_by_me: mine,
        reactors,
        comment_count: comments.length,
        comments,
        mine: p.author_user_id === userId,
        author_is_following: p.author_is_following,
      };
    });
  }

  async createPost(userId: string, workspaceId: string | null, content: string, imageUrl?: string | null): Promise<{ id: string }> {
    const text = content.trim();
    const image = imageUrl?.trim() || null;
    if (!text && !image) throw new BadRequestException('Post is empty.');
    const [row] = image
      ? await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `INSERT INTO public.network_posts (author_user_id, author_workspace_id, content, image_url)
           VALUES ($1::uuid, $2::uuid, $3, $4) RETURNING id`,
          userId, workspaceId, text.slice(0, 4000), image)
      : await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `INSERT INTO public.network_posts (author_user_id, author_workspace_id, content)
           VALUES ($1::uuid, $2::uuid, $3) RETURNING id`,
          userId, workspaceId, text.slice(0, 4000));
    return row;
  }

  async toggleReaction(userId: string, postId: string, reaction: string): Promise<{ ok: true }> {
    if (!REACTION_KEYS.includes(reaction as ReactionKey)) throw new BadRequestException('Invalid reaction.');
    await this.requirePost(postId);
    const removed = await this.prisma.$executeRawUnsafe(
      `DELETE FROM public.network_post_reactions WHERE post_id = $1::uuid AND user_id = $2::uuid AND reaction = $3`,
      postId, userId, reaction);
    if (removed === 0) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO public.network_post_reactions (post_id, user_id, reaction) VALUES ($1::uuid, $2::uuid, $3)
         ON CONFLICT DO NOTHING`, postId, userId, reaction);
    }
    return { ok: true };
  }

  async addComment(userId: string, workspaceId: string | null, postId: string, content: string): Promise<NetworkComment> {
    const text = content.trim();
    if (!text) throw new BadRequestException('Comment is empty.');
    const post = await this.requirePost(postId);
    const [row] = await this.prisma.$queryRawUnsafe<Array<{
      id: string; created_at: Date; practice_name: string | null; practice_display: string | null; author_role: string | null;
    }>>(
      `WITH ins AS (
         INSERT INTO public.network_comments (post_id, author_user_id, author_workspace_id, content)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4) RETURNING id, created_at, author_workspace_id, author_user_id
       )
       SELECT ins.id, ins.created_at,
              w.name AS practice_name, w.display_name AS practice_display, wm.role::text AS author_role
         FROM ins
         LEFT JOIN public.workspaces w ON w.id = ins.author_workspace_id
         LEFT JOIN public.workspace_members wm ON wm.user_id = ins.author_user_id AND wm.workspace_id = ins.author_workspace_id`,
      postId, userId, workspaceId, text.slice(0, 2000));

    // Tell the post's author a peer commented (never self-notify). Best-effort.
    if (post.author_user_id !== userId && post.author_workspace_id) {
      const me = practiceName(row.practice_display, row.practice_name, null);
      const preview = text.length > 90 ? `${text.slice(0, 90)}…` : text.trim();
      void this.notifications.notifyUser(post.author_workspace_id, post.author_user_id, {
        type: 'network:comment',
        title: '💬 New comment on your network post',
        body: `${me}: ${preview}`,
        url: '/community',
        tag: `network-comment-${postId}`,
      });
    }

    return {
      id: row.id,
      content: text.slice(0, 2000),
      created_at: row.created_at.toISOString(),
      author_practice: practiceName(row.practice_display, row.practice_name, null),
      author_role: row.author_role,
      mine: true,
    };
  }

  // ── Follows ────────────────────────────────────────────────────────────
  /** Follow another practitioner; notifies them. Idempotent. */
  async follow(userId: string, workspaceId: string | null, targetUserId: string): Promise<{ following: boolean }> {
    if (userId === targetUserId) throw new BadRequestException('You cannot follow yourself.');
    const inserted = await this.prisma.$executeRawUnsafe(
      `INSERT INTO public.network_follows (follower_user_id, following_user_id)
       VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`,
      userId, targetUserId);
    // Only notify on a fresh follow (not a repeat), and only if we can resolve
    // the target's workspace to anchor the notification.
    if (inserted > 0 && workspaceId) {
      const [me] = await this.prisma.$queryRawUnsafe<Array<{ practice_name: string | null; practice_display: string | null }>>(
        `SELECT w.name AS practice_name, w.display_name AS practice_display
           FROM public.workspaces w WHERE w.id = $1::uuid LIMIT 1`, workspaceId);
      const [target] = await this.prisma.$queryRawUnsafe<Array<{ workspace_id: string }>>(
        `SELECT workspace_id FROM public.workspace_members
          WHERE user_id = $1::uuid AND status = 'active'
          ORDER BY (role = 'owner') DESC, joined_at ASC LIMIT 1`, targetUserId);
      if (target?.workspace_id) {
        void this.notifications.notifyUser(target.workspace_id, targetUserId, {
          type: 'network:follow',
          title: '🤝 New follower on the network',
          body: `${practiceName(me?.practice_display ?? null, me?.practice_name ?? null, null)} started following you.`,
          url: '/community',
          tag: `network-follow-${userId}`,
        });
      }
    }
    return { following: true };
  }

  async unfollow(userId: string, targetUserId: string): Promise<{ following: boolean }> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM public.network_follows WHERE follower_user_id = $1::uuid AND following_user_id = $2::uuid`,
      userId, targetUserId);
    return { following: false };
  }

  /** Who follows me + who I follow, each resolved to a practice + role. */
  async follows(userId: string): Promise<{ followers: NetworkPerson[]; following: NetworkPerson[] }> {
    // `pick` selects which side of the follow edge is the "other" person, and
    // `mine` (whether I follow them) is computed per row so the UI can offer a
    // follow-back on people who follow me.
    const rows = (pick: 'followers' | 'following') => this.prisma.$queryRawUnsafe<Array<{
      user_id: string; practice_name: string | null; practice_display: string | null; author_email: string | null;
      role: string | null; i_follow: boolean;
    }>>(
      `SELECT ${pick === 'followers' ? 'f.follower_user_id' : 'f.following_user_id'} AS user_id,
              w.name AS practice_name, w.display_name AS practice_display, u.email AS author_email,
              wm.role::text AS role,
              EXISTS(SELECT 1 FROM public.network_follows f2
                      WHERE f2.follower_user_id = $1::uuid
                        AND f2.following_user_id = ${pick === 'followers' ? 'f.follower_user_id' : 'f.following_user_id'}) AS i_follow
         FROM public.network_follows f
         LEFT JOIN LATERAL (
           SELECT workspace_id, role FROM public.workspace_members
            WHERE user_id = ${pick === 'followers' ? 'f.follower_user_id' : 'f.following_user_id'} AND status = 'active'
            ORDER BY (role = 'owner') DESC, joined_at ASC LIMIT 1
         ) wm ON true
         LEFT JOIN public.workspaces w ON w.id = wm.workspace_id
         LEFT JOIN auth.users u ON u.id = ${pick === 'followers' ? 'f.follower_user_id' : 'f.following_user_id'}
        WHERE ${pick === 'followers' ? 'f.following_user_id' : 'f.follower_user_id'} = $1::uuid
        ORDER BY f.created_at DESC`,
      userId);

    const map = (r: { user_id: string; practice_name: string | null; practice_display: string | null; author_email: string | null; role: string | null; i_follow: boolean }): NetworkPerson => ({
      user_id: r.user_id,
      practice: practiceName(r.practice_display, r.practice_name, r.author_email),
      role: r.role,
      i_follow: r.i_follow,
    });
    const [followers, following] = await Promise.all([rows('followers'), rows('following')]);
    return { followers: followers.map(map), following: following.map(map) };
  }

  async deletePost(userId: string, isSuperAdmin: boolean, postId: string): Promise<void> {
    const [post] = await this.prisma.$queryRawUnsafe<Array<{ author_user_id: string }>>(
      `SELECT author_user_id FROM public.network_posts WHERE id = $1::uuid LIMIT 1`, postId);
    if (!post) throw new NotFoundException('Post not found.');
    if (post.author_user_id !== userId && !isSuperAdmin) {
      throw new ForbiddenException('You can only delete your own posts.');
    }
    await this.prisma.$executeRawUnsafe(`DELETE FROM public.network_posts WHERE id = $1::uuid`, postId);
  }

  private async requirePost(postId: string): Promise<{ author_user_id: string; author_workspace_id: string | null }> {
    const [post] = await this.prisma.$queryRawUnsafe<Array<{ author_user_id: string; author_workspace_id: string | null }>>(
      `SELECT author_user_id, author_workspace_id FROM public.network_posts WHERE id = $1::uuid LIMIT 1`, postId);
    if (!post) throw new NotFoundException('Post not found.');
    return post;
  }

  /** Run a read that may hit a not-yet-created table; fall back to `dflt`. */
  private async safe<T>(fn: () => Promise<T>, dflt: T): Promise<T> {
    try { return await fn(); } catch { return dflt; }
  }
}

function zeroReactions(): Record<ReactionKey, number> {
  return { cheer: 0, strength: 0, love: 0, celebrate: 0 };
}

function practiceName(display: string | null, name: string | null, email: string | null): string {
  return display || name || (email ? email.split('@')[0] : 'A practitioner');
}

export interface NetworkComment {
  id: string;
  content: string;
  created_at: string;
  author_practice: string;
  author_role: string | null;
  mine: boolean;
}

export interface NetworkReactor {
  user_id: string;
  reaction: ReactionKey;
  practice: string;
  role: string | null;
  mine: boolean;
}

export interface NetworkPerson {
  user_id: string;
  practice: string;
  role: string | null;
  /** Do I follow this person? (drives Follow / Following on the list). */
  i_follow: boolean;
}

export interface NetworkPost {
  id: string;
  content: string;
  created_at: string;
  author_user_id: string;
  author_practice: string;
  author_role: string | null;
  author_email: string | null;
  image_url: string | null;
  reactions: Record<ReactionKey, number>;
  reacted_by_me: ReactionKey[];
  reactors: NetworkReactor[];
  comment_count: number;
  comments: NetworkComment[];
  mine: boolean;
  /** Does the caller follow this post's author? */
  author_is_following: boolean;
}
