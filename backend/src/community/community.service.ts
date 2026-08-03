import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** The four reaction keys the owner community UI uses. */
export const REACTION_KEYS = ['cheer', 'strength', 'love', 'celebrate'] as const;
export type ReactionKey = (typeof REACTION_KEYS)[number];

export type AuthorRole = 'owner' | 'manager' | 'coach' | 'client';

export interface CommunityAuthor {
  id: string;
  name: string;
  role: AuthorRole;
}
export interface CommunityComment {
  id: string;
  author: CommunityAuthor;
  body: string;
  createdAt: string;
}
export interface CommunityPost {
  id: string;
  author: CommunityAuthor;
  body: string;
  hashtags: string[];
  imageUrl?: string;
  reactions: Record<ReactionKey, number>;
  reactedByMe: ReactionKey[];
  commentCount: number;
  comments: CommunityComment[];
  createdAt: string;
  pinned: boolean;
  cohort?: string;
}
export interface Cohort {
  id: string;
  label: string;
  members: number;
}

/**
 * CommunityService — workspace/owner-facing view over the shared community
 * tables (the same data clients post into from the portal).
 *
 * Every query is scoped by workspace_id so practices are isolated. The owner
 * authors as a *user* (author_user_id) rather than a client, and is surfaced
 * with the 'owner' role. Reactions are de-duplicated per owner via user_id.
 */
@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private ws(workspaceId: string | null | undefined): string {
    if (!workspaceId) throw new ForbiddenException('Not in a workspace.');
    return workspaceId;
  }

  private zeroReactions(): Record<ReactionKey, number> {
    return { cheer: 0, strength: 0, love: 0, celebrate: 0 };
  }

  private asHashtags(tags: unknown): string[] {
    if (Array.isArray(tags)) return tags.filter((t): t is string => typeof t === 'string');
    return [];
  }

  private extractHashtags(text: string): string[] {
    const out: string[] = [];
    const re = /#(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) if (!out.includes(m[1])) out.push(m[1]);
    return out;
  }

  // ── Cohorts (community groups) ─────────────────────────────────────────

  async cohorts(workspaceIdRaw: string | null): Promise<Cohort[]> {
    const workspaceId = this.ws(workspaceIdRaw);
    const groups = await this.prisma.community_groups.findMany({
      where: { workspace_id: workspaceId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, member_count: true },
    });
    return groups.map((g) => ({ id: g.id, label: g.name, members: g.member_count ?? 0 }));
  }

  /**
   * Create a workspace-owned cohort (owner_client_id is null — the practice, not
   * a client, owns it). `slug` is globally unique, so we derive one from the
   * name and add a short random tail if it collides.
   */
  async createCohort(workspaceIdRaw: string | null, name: string, description?: string): Promise<Cohort> {
    const workspaceId = this.ws(workspaceIdRaw);
    const label = (name ?? '').trim();
    if (!label) throw new BadRequestException('Cohort name is required.');
    if (label.length > 80) throw new BadRequestException('Cohort name is too long (max 80).');

    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cohort';
    let slug = base;
    for (let i = 0; i < 6; i++) {
      const clash = await this.prisma.community_groups.findFirst({ where: { slug }, select: { id: true } });
      if (!clash) break;
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const g = await this.prisma.community_groups.create({
      data: {
        name: label,
        slug,
        description: (description ?? '').trim() || null,
        workspace_id: workspaceId,
        owner_client_id: null,
        member_count: 0,
      },
      select: { id: true, name: true, member_count: true },
    });
    return { id: g.id, label: g.name, members: g.member_count ?? 0 };
  }

  /**
   * Delete a workspace cohort. Posts made to it are DETACHED (group_id → null)
   * first so they survive as general-feed posts — the group→post relation
   * cascades on delete, so without this the posts would be deleted with it.
   */
  async deleteCohort(workspaceIdRaw: string | null, cohortId: string): Promise<{ deleted: true }> {
    const workspaceId = this.ws(workspaceIdRaw);
    const g = await this.prisma.community_groups.findFirst({
      where: { id: cohortId, workspace_id: workspaceId },
      select: { id: true },
    });
    if (!g) throw new NotFoundException('Cohort not found.');
    await this.prisma.community_posts.updateMany({ where: { group_id: cohortId }, data: { group_id: null } });
    await this.prisma.community_groups.delete({ where: { id: cohortId } });
    return { deleted: true };
  }

  // ── Feed ───────────────────────────────────────────────────────────────

  async feed(
    workspaceIdRaw: string | null,
    ownerUserId: string,
    cohortId?: string,
  ): Promise<CommunityPost[]> {
    const workspaceId = this.ws(workspaceIdRaw);
    const posts = await this.prisma.community_posts.findMany({
      where: {
        workspace_id: workspaceId,
        ...(cohortId && cohortId !== 'all' ? { group_id: cohortId } : {}),
      },
      orderBy: [{ pinned: 'desc' }, { created_at: 'desc' }],
      take: 100,
      include: {
        community_groups: { select: { name: true } },
      },
    });
    if (posts.length === 0) return [];

    const postIds = posts.map((p) => p.id);

    // Reaction counts per post + which ones this owner reacted with.
    const reactionRows = await this.prisma.community_reactions.findMany({
      where: { target_type: 'post', target_id: { in: postIds } },
      select: { target_id: true, reaction: true, user_id: true },
    });
    const countsByPost = new Map<string, Record<ReactionKey, number>>();
    const mineByPost = new Map<string, Set<ReactionKey>>();
    for (const r of reactionRows) {
      const key = r.reaction as ReactionKey;
      if (!REACTION_KEYS.includes(key)) continue; // ignore legacy 'like'
      if (!countsByPost.has(r.target_id)) countsByPost.set(r.target_id, this.zeroReactions());
      countsByPost.get(r.target_id)![key] += 1;
      if (r.user_id === ownerUserId) {
        if (!mineByPost.has(r.target_id)) mineByPost.set(r.target_id, new Set());
        mineByPost.get(r.target_id)!.add(key);
      }
    }

    // A few recent comments per post for inline preview.
    const commentRows = await this.prisma.community_comments.findMany({
      where: { post_id: { in: postIds } },
      orderBy: { created_at: 'asc' },
      select: {
        id: true, post_id: true, content: true, created_at: true,
        author_display_name: true, author_user_id: true, author_client_id: true, author_role: true,
      },
    });
    const commentsByPost = new Map<string, CommunityComment[]>();
    for (const c of commentRows) {
      const list = commentsByPost.get(c.post_id) ?? [];
      list.push({
        id: c.id,
        author: {
          id: c.author_user_id ?? c.author_client_id ?? 'unknown',
          name: c.author_display_name,
          role: c.author_user_id ? 'owner' : 'client',
        },
        body: c.content,
        createdAt: (c.created_at ?? new Date()).toISOString(),
      });
      commentsByPost.set(c.post_id, list);
    }

    return posts.map((p) => {
      const media = Array.isArray(p.media_urls) ? (p.media_urls as unknown[]) : [];
      const imageUrl = media.find((m): m is string => typeof m === 'string');
      return {
        id: p.id,
        author: {
          id: p.author_user_id ?? p.author_client_id ?? 'unknown',
          name: p.author_display_name,
          role: p.author_user_id ? 'owner' : 'client',
        },
        body: p.content,
        hashtags: this.asHashtags(p.tags),
        imageUrl,
        reactions: countsByPost.get(p.id) ?? this.zeroReactions(),
        reactedByMe: Array.from(mineByPost.get(p.id) ?? []),
        commentCount: commentsByPost.get(p.id)?.length ?? p.comments_count ?? 0,
        comments: (commentsByPost.get(p.id) ?? []).slice(-3),
        createdAt: (p.created_at ?? new Date()).toISOString(),
        pinned: !!p.pinned,
        cohort: p.community_groups?.name,
      };
    });
  }

  // ── Create / pin / delete ────────────────────────────────────────────

  async createPost(
    workspaceIdRaw: string | null,
    ownerUserId: string,
    body: { content: string; authorName: string; pinned?: boolean; cohortId?: string; imageUrl?: string },
  ): Promise<{ id: string }> {
    const workspaceId = this.ws(workspaceIdRaw);
    const content = body.content.trim();
    if (!content && !body.imageUrl) throw new ForbiddenException('Post is empty.');
    // Only honour a cohort that belongs to this workspace.
    let groupId: string | null = null;
    if (body.cohortId && body.cohortId !== 'all') {
      const g = await this.prisma.community_groups.findFirst({
        where: { id: body.cohortId, workspace_id: workspaceId },
        select: { id: true },
      });
      groupId = g?.id ?? null;
    }
    const post = await this.prisma.community_posts.create({
      data: {
        workspace_id: workspaceId,
        author_user_id: ownerUserId,
        author_display_name: body.authorName || 'Workspace owner',
        author_role: 'admin',
        group_id: groupId,
        content,
        tags: this.extractHashtags(content),
        media_urls: body.imageUrl ? [body.imageUrl] : [],
        pinned: body.pinned ?? false,
      },
      select: { id: true },
    });
    return { id: post.id };
  }

  async setPin(workspaceIdRaw: string | null, postId: string, pinned: boolean): Promise<{ pinned: boolean }> {
    const workspaceId = this.ws(workspaceIdRaw);
    const post = await this.prisma.community_posts.findFirst({
      where: { id: postId, workspace_id: workspaceId },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found.');
    await this.prisma.community_posts.update({ where: { id: postId }, data: { pinned } });
    return { pinned };
  }

  async deletePost(workspaceIdRaw: string | null, postId: string): Promise<{ deleted: true }> {
    const workspaceId = this.ws(workspaceIdRaw);
    const post = await this.prisma.community_posts.findFirst({
      where: { id: postId, workspace_id: workspaceId },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found.');
    await this.prisma.community_posts.delete({ where: { id: postId } });
    return { deleted: true };
  }

  // ── Reactions (owner) ────────────────────────────────────────────────

  async toggleReaction(
    workspaceIdRaw: string | null,
    ownerUserId: string,
    postId: string,
    reaction: ReactionKey,
  ): Promise<{ reacted: boolean }> {
    const workspaceId = this.ws(workspaceIdRaw);
    const post = await this.prisma.community_posts.findFirst({
      where: { id: postId, workspace_id: workspaceId },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found.');

    const existing = await this.prisma.community_reactions.findFirst({
      where: { user_id: ownerUserId, target_type: 'post', target_id: postId, reaction },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.community_reactions.delete({ where: { id: existing.id } });
      return { reacted: false };
    }
    await this.prisma.community_reactions.create({
      data: {
        workspace_id: workspaceId,
        user_id: ownerUserId,
        target_type: 'post',
        target_id: postId,
        reaction,
      },
    });
    return { reacted: true };
  }

  // ── Comments ───────────────────────────────────────────────────────────

  async addComment(
    workspaceIdRaw: string | null,
    ownerUserId: string,
    postId: string,
    body: { content: string; authorName: string },
  ): Promise<{ id: string }> {
    const workspaceId = this.ws(workspaceIdRaw);
    const content = body.content.trim();
    if (!content) throw new ForbiddenException('Comment is empty.');
    const post = await this.prisma.community_posts.findFirst({
      where: { id: postId, workspace_id: workspaceId },
      select: { id: true, author_user_id: true, author_client_id: true },
    });
    if (!post) throw new NotFoundException('Post not found.');
    const [comment] = await this.prisma.$transaction([
      this.prisma.community_comments.create({
        data: {
          post_id: postId,
          workspace_id: workspaceId,
          author_user_id: ownerUserId,
          author_display_name: body.authorName || 'Workspace owner',
          author_role: 'admin',
          content,
        },
        select: { id: true },
      }),
      this.prisma.community_posts.update({
        where: { id: postId },
        data: { comments_count: { increment: 1 } },
      }),
    ]);

    // Notify the post's author that someone commented (never self-notify).
    const preview = content.length > 90 ? `${content.slice(0, 90)}…` : content;
    const n = {
      type: 'community:comment',
      title: '💬 New comment on your post',
      body: `${body.authorName || 'Someone'}: ${preview}`,
      tag: `community-comment-${postId}`,
    };
    if (post.author_user_id && post.author_user_id !== ownerUserId) {
      void this.notifications.notifyUser(workspaceId, post.author_user_id, { ...n, url: '/community' });
    } else if (post.author_client_id) {
      void this.notifications.notifyClient(workspaceId, post.author_client_id, { ...n, url: '/portal/community' });
    }
    return { id: comment.id };
  }

  // ── Trending + moderation ───────────────────────────────────────────────

  async trending(workspaceIdRaw: string | null): Promise<Array<{ tag: string; posts: number; trend: 'up' | 'flat' | 'down' }>> {
    const workspaceId = this.ws(workspaceIdRaw);
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const rows = await this.prisma.community_posts.findMany({
      where: { workspace_id: workspaceId, created_at: { gte: since } },
      select: { tags: true },
    });
    const counts = new Map<string, number>();
    for (const r of rows) {
      for (const tag of this.asHashtags(r.tags)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag, posts]) => ({ tag, posts, trend: posts >= 3 ? 'up' : 'flat' as const }));
  }

  async moderation(workspaceIdRaw: string | null): Promise<{ flagged: number; engagementRate: number; totalPosts: number }> {
    const workspaceId = this.ws(workspaceIdRaw);
    const posts = await this.prisma.community_posts.findMany({
      where: { workspace_id: workspaceId },
      select: { id: true, comments_count: true },
    });
    const total = posts.length;
    const postIds = posts.map((p) => p.id);

    const [flagged, reactedPostIds] = await Promise.all([
      postIds.length
        ? this.prisma.community_reports.count({
            where: { target_type: 'post', target_id: { in: postIds }, status: 'open' },
          })
        : Promise.resolve(0),
      postIds.length
        ? this.prisma.community_reactions.findMany({
            where: { target_type: 'post', target_id: { in: postIds } },
            select: { target_id: true },
            distinct: ['target_id'],
          })
        : Promise.resolve([] as Array<{ target_id: string }>),
    ]);

    const engaged = new Set(reactedPostIds.map((r) => r.target_id));
    for (const p of posts) if ((p.comments_count ?? 0) > 0) engaged.add(p.id);
    const engagementRate = total === 0 ? 0 : Math.round((engaged.size / total) * 100);

    return { flagged, engagementRate, totalPosts: total };
  }
}