import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Users, Heart, MessageCircle, Send, Loader2, Award,
  Sparkles, Plus, X, ChevronRight, MoreHorizontal, Pin, PinOff, Trash2,
  Shield, ShieldOff, UserX, VolumeX, Volume2, ShieldCheck,
  Flame, Trophy, Timer, Droplets, Activity as ActivityIcon, PenSquare,
} from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import {
  clientsApi,
  type ChallengeMetric,
  type CommunityGroup,
  type CommunityPost,
} from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

type ModRole = 'owner' | 'moderator' | 'member' | null;
const isMod = (r: ModRole) => r === 'owner' || r === 'moderator';

/**
 * Community — groups list + post feed + composer + reactions + comments.
 *
 * The brief calls it "Community" — the spirit is Headspace-style supportive
 * peers, not Twitter. Posts are short (1000 char cap), reactions are
 * positive-only (like/love/celebrate — no thumbs-down), and the composer
 * is always one-tap-away at the top of the feed.
 */
export default function ClientCommunity() {
  const queryClient = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const groupsQ = useQuery({
    queryKey: ['me', 'community', 'groups'],
    queryFn: () => clientsApi.listGroups(),
    retry: 1,
  });
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [commentingOn, setCommentingOn] = useState<string | null>(null);

  const postsQ = useQuery({
    queryKey: ['me', 'community', 'posts', selectedGroup],
    queryFn: () => clientsApi.listPosts({ groupId: selectedGroup ?? undefined, limit: 30 }),
    retry: 1,
  });

  const groups = groupsQ.data ?? [];
  const myGroups = groups.filter((g) => g.is_member);
  const discoverable = groups.filter((g) => !g.is_member);
  const featured = groups.find((g) => g.member_count > 0) ?? groups[0];
  const posts = postsQ.data ?? [];

  // Map group_id → group so PostCard can look up the caller's role/status
  // without re-fetching. Computed once per render.
  const groupsById = useMemo(() => {
    const m: Record<string, CommunityGroup> = {};
    for (const g of groups) m[g.id] = g;
    return m;
  }, [groups]);

  // Manage-members panel state — which group is being managed, if any.
  const [managingGroup, setManagingGroup] = useState<CommunityGroup | null>(null);
  // Active leaderboard view — which challenge group's leaderboard is open.
  const [leaderboardGroup, setLeaderboardGroup] = useState<CommunityGroup | null>(null);

  // Only show active or upcoming challenges. Past ones still exist in the DB
  // but we don't surface them here — the leaderboard panel can re-open them
  // directly if linked from a "Your groups" row.
  const activeChallenges = groups.filter(
    (g) => g.is_challenge && g.ends_at && new Date(g.ends_at).getTime() > Date.now(),
  );

  const joinMut = useMutation({
    mutationFn: (id: string) => clientsApi.joinGroup(id),
    onSuccess: () => {
      toast.success('Joined.');
      queryClient.invalidateQueries({ queryKey: ['me', 'community', 'groups'] });
      queryClient.invalidateQueries({ queryKey: ['me', 'community', 'posts'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not join.'),
  });
  const leaveMut = useMutation({
    mutationFn: (id: string) => clientsApi.leaveGroup(id),
    onSuccess: () => {
      toast.success('Left group.');
      queryClient.invalidateQueries({ queryKey: ['me', 'community', 'groups'] });
      queryClient.invalidateQueries({ queryKey: ['me', 'community', 'posts'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not leave.'),
  });
  const reactMut = useMutation({
    mutationFn: (id: string) => clientsApi.reactToPost(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'community', 'posts'] });
    },
  });

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Together · Community</span>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">You're not alone.</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65">
            Groups, challenges, and a steady feed of small wins from your wellness community.
          </p>
        </motion.div>

        {/* On large screens: feed on the left, groups/challenges in a sticky aside. */}
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
        {/* Featured group banner */}
        {featured && (
          <motion.div variants={fadeUp}>
            <AIGlow intensity="soft" animated>
              <Glass variant="heavy" className="p-5">
                <div className="flex items-start gap-3">
                  <Award className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
                  <div className="flex-1">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">Featured</div>
                    <div className="mt-1 text-lg font-semibold">{featured.name}</div>
                    {featured.description && (
                      <div className="mt-1 text-sm text-foreground/65">{featured.description}</div>
                    )}
                    <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-foreground/55">
                      <Users className="h-3 w-3" /> {featured.member_count} members
                    </div>
                  </div>
                  {!featured.is_member && (
                    <button
                      type="button"
                      onClick={() => joinMut.mutate(featured.id)}
                      disabled={joinMut.isPending}
                      className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-xs font-medium text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.55)]"
                    >
                      {joinMut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                      Join
                    </button>
                  )}
                </div>
              </Glass>
            </AIGlow>
          </motion.div>
        )}

        {/* Feed scope picker — "all" / "joined group X" */}
        <motion.div variants={fadeUp} className="mt-6">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedGroup(null)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                selectedGroup === null
                  ? 'bg-gradient-to-br from-blue-600/40 to-fuchsia-500/30 text-foreground'
                  : 'border border-foreground/10 text-foreground/65 hover:bg-foreground/[0.04]',
              )}
            >
              Everyone
            </button>
            {myGroups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedGroup(g.id)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  selectedGroup === g.id
                    ? 'bg-gradient-to-br from-blue-600/40 to-fuchsia-500/30 text-foreground'
                    : 'border border-foreground/10 text-foreground/65 hover:bg-foreground/[0.04]',
                )}
              >
                {g.name}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Composer */}
        <motion.div variants={fadeUp} className="mt-4">
          <Composer
            groupId={selectedGroup ?? undefined}
            groupName={selectedGroup ? groups.find((g) => g.id === selectedGroup)?.name : undefined}
          />
        </motion.div>

        {/* Post feed */}
        <motion.div variants={fadeUp} className="mt-6 space-y-3">
          {postsQ.isLoading ? (
            <Glass className="flex items-center justify-center p-8 text-sm text-foreground/55">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading the feed…
            </Glass>
          ) : posts.length === 0 ? (
            <Glass className="flex flex-col items-center gap-2 p-8 text-center">
              <MessageCircle className="h-6 w-6 text-foreground/35" />
              <div className="text-sm text-foreground/65">
                {selectedGroup ? 'No posts in this group yet. Be the first.' : 'No posts yet. Be the first to share something.'}
              </div>
            </Glass>
          ) : (
            posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                myClientId={profileQ.data?.id ?? null}
                groupRole={(p.group_id && groupsById[p.group_id]?.my_role) || null}
                onReact={() => reactMut.mutate(p.id)}
                expanded={commentingOn === p.id}
                onToggleComments={() => setCommentingOn(commentingOn === p.id ? null : p.id)}
              />
            ))
          )}
        </motion.div>
        </div>

        {/* Sticky aside: challenges + discover + your groups. Single-column to
            sit comfortably in the narrower side rail on large screens; falls
            back to its own full-width section below the feed on small screens. */}
        <aside className="space-y-8 lg:sticky lg:top-6">
        {/* Active challenges — time-bounded groups with leaderboards */}
        {activeChallenges.length > 0 && (
          <motion.div variants={fadeUp}>
            <div className="mb-3 flex items-center gap-2">
              <Flame className="h-4 w-4 text-amber-500" />
              <h2 className="text-base font-semibold">Active challenges</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {activeChallenges.map((c) => (
                <ChallengeCard
                  key={c.id}
                  group={c}
                  busyJoin={joinMut.isPending && joinMut.variables === c.id}
                  onJoin={() => joinMut.mutate(c.id)}
                  onOpen={() => setLeaderboardGroup(c)}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Discover groups */}
        {discoverable.length > 0 && (
          <motion.div variants={fadeUp}>
            <h2 className="mb-3 text-base font-semibold">Discover groups</h2>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-1">
              {discoverable.map((g) => (
                <GroupCard
                  key={g.id}
                  group={g}
                  busy={joinMut.isPending && joinMut.variables === g.id}
                  onJoin={() => joinMut.mutate(g.id)}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Your groups, with a leave option + manage tools for mods */}
        {myGroups.length > 0 && (
          <motion.div variants={fadeUp}>
            <h2 className="mb-3 text-base font-semibold">Your groups</h2>
            <div className="space-y-2">
              {myGroups.map((g) => (
                <Glass key={g.id} className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {g.name}
                        {g.my_role === 'owner' && (
                          <span className="rounded-full bg-amber-500/15 px-1.5 py-0 text-[9px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">
                            Owner
                          </span>
                        )}
                        {g.my_role === 'moderator' && (
                          <span className="rounded-full bg-violet-500/15 px-1.5 py-0 text-[9px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-200">
                            Mod
                          </span>
                        )}
                        {g.my_status === 'muted' && (
                          <span className="rounded-full bg-rose-500/15 px-1.5 py-0 text-[9px] uppercase tracking-[0.18em] text-rose-700 dark:text-rose-200">
                            Muted
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-foreground/55">{g.member_count} members</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {isMod(g.my_role) && (
                      <button
                        type="button"
                        onClick={() => setManagingGroup(g)}
                        className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs text-foreground/80 hover:bg-foreground/[0.05]"
                      >
                        <ShieldCheck className="h-3 w-3" /> Manage
                      </button>
                    )}
                    {g.my_role !== 'owner' && (
                      <button
                        type="button"
                        onClick={() => leaveMut.mutate(g.id)}
                        disabled={leaveMut.isPending && leaveMut.variables === g.id}
                        className="rounded-full px-3 py-1 text-xs text-foreground/65 hover:bg-foreground/[0.05] hover:text-foreground"
                      >
                        {leaveMut.isPending && leaveMut.variables === g.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Leave'}
                      </button>
                    )}
                  </div>
                </Glass>
              ))}
            </div>
          </motion.div>
        )}
        </aside>
        </div>
      </motion.div>

      <AnimatePresence>
        {managingGroup && (
          <ManagePanel
            group={managingGroup}
            onClose={() => setManagingGroup(null)}
          />
        )}
        {leaderboardGroup && (
          <LeaderboardPanel
            group={leaderboardGroup}
            onClose={() => setLeaderboardGroup(null)}
            onJoin={() => joinMut.mutate(leaderboardGroup.id)}
            joining={joinMut.isPending && joinMut.variables === leaderboardGroup.id}
          />
        )}
      </AnimatePresence>
    </ClientLayout>
  );
}

// ──────────────────────────────────────────────────────────────────

function Composer({ groupId, groupName }: { groupId?: string; groupName?: string }) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [open, setOpen] = useState(false);

  const postMut = useMutation({
    mutationFn: () => clientsApi.createPost({ content: content.trim(), groupId }),
    onSuccess: () => {
      toast.success('Posted.');
      setContent('');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['me', 'community', 'posts'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not post.'),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] p-3 text-left transition-colors hover:bg-foreground/[0.04]"
      >
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500/15 to-fuchsia-500/10">
          <Plus className="h-4 w-4 text-violet-600" />
        </div>
        <span className="text-sm text-foreground/55">
          Share a small win{groupName ? ` with ${groupName}` : ''}…
        </span>
      </button>
    );
  }

  return (
    <Glass className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-foreground/55">
          Posting{groupName ? ` to ${groupName}` : ' to everyone'}
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); setContent(''); }}
          className="grid h-7 w-7 place-items-center rounded-lg text-foreground/65 hover:bg-foreground/[0.05]"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <textarea
        autoFocus
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What's one thing that went well today?"
        rows={3}
        maxLength={1000}
        className="mt-3 w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm placeholder:text-foreground/40 focus:border-violet-400/50 focus:outline-none"
      />
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="text-[10px] text-foreground/45">{content.length} / 1000</div>
        <button
          type="button"
          onClick={() => postMut.mutate()}
          disabled={postMut.isPending || content.trim().length === 0}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-xs font-medium text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.55)] disabled:opacity-50"
        >
          {postMut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          <Send className="h-3 w-3" />
          Post
        </button>
      </div>
    </Glass>
  );
}

function PostCard({ post, myClientId, groupRole, onReact, expanded, onToggleComments }: {
  post: CommunityPost;
  myClientId: string | null;
  groupRole: ModRole;
  onReact: () => void;
  expanded: boolean;
  onToggleComments: () => void;
}) {
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = post.author_display_name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const isAuthor = myClientId !== null && post.author_client_id === myClientId;
  const canModerateGroup = isMod(groupRole);
  const canDelete = isAuthor || canModerateGroup;
  // Pinning only makes sense inside a group, and only mods/owner can.
  const canPin = canModerateGroup && !!post.group_id;
  const hasMenu = canDelete || canPin;

  const pinMut = useMutation({
    mutationFn: () => clientsApi.pinPost(post.id),
    onSuccess: (res) => {
      toast.success(res.pinned ? 'Pinned.' : 'Unpinned.');
      setMenuOpen(false);
      queryClient.invalidateQueries({ queryKey: ['me', 'community', 'posts'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not pin.'),
  });
  const deleteMut = useMutation({
    mutationFn: () => clientsApi.deletePost(post.id),
    onSuccess: () => {
      toast.success('Post deleted.');
      setMenuOpen(false);
      queryClient.invalidateQueries({ queryKey: ['me', 'community', 'posts'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not delete.'),
  });

  return (
    <Glass className="p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400/40 to-teal-500/30 text-xs font-medium text-white">
          {initials}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">{post.author_display_name}</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/45">
              {formatTime(post.created_at)}
            </div>
            {post.pinned && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0 text-[9px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">
                pinned
              </span>
            )}

            {hasMenu && (
              <div className="relative ml-auto">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="grid h-7 w-7 place-items-center rounded-full text-foreground/55 hover:bg-foreground/[0.05]"
                  aria-label="Post actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-8 z-10 min-w-[160px] overflow-hidden rounded-xl border border-foreground/10 bg-popover shadow-lg"
                  >
                    {canPin && (
                      <button
                        type="button"
                        onClick={() => pinMut.mutate()}
                        disabled={pinMut.isPending}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-foreground/85 hover:bg-foreground/[0.05]"
                      >
                        {post.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                        {post.pinned ? 'Unpin from group' : 'Pin to group'}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!confirm('Delete this post? This cannot be undone.')) return;
                          deleteMut.mutate();
                        }}
                        disabled={deleteMut.isPending}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {isAuthor ? 'Delete my post' : 'Delete as moderator'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {post.title && <div className="mt-1 text-sm font-semibold">{post.title}</div>}
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground/85">{post.content}</p>

          <div className="mt-3 flex items-center gap-4 text-xs text-foreground/55">
            <button
              type="button"
              onClick={onReact}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors',
                post.i_reacted
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300'
                  : 'hover:bg-foreground/[0.05]',
              )}
            >
              <Heart className={cn('h-3.5 w-3.5', post.i_reacted && 'fill-current')} />
              {post.likes_count}
            </button>
            <button
              type="button"
              onClick={onToggleComments}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 hover:bg-foreground/[0.05]"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {post.comments_count}
              <ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
            </button>
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-3 overflow-hidden"
              >
                <CommentsSection
                  postId={post.id}
                  postGroupId={post.group_id}
                  myClientId={myClientId}
                  canModerateGroup={canModerateGroup}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Glass>
  );
}

function CommentsSection({
  postId, postGroupId, myClientId, canModerateGroup,
}: {
  postId: string;
  postGroupId: string | null;
  myClientId: string | null;
  canModerateGroup: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const commentsQ = useQuery({
    queryKey: ['me', 'community', 'comments', postId],
    queryFn: () => clientsApi.listComments(postId),
    retry: 1,
  });
  const addMut = useMutation({
    mutationFn: () => clientsApi.createComment(postId, draft.trim()),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['me', 'community', 'comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['me', 'community', 'posts'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not comment.'),
  });
  const deleteCommentMut = useMutation({
    mutationFn: (commentId: string) => clientsApi.deleteComment(commentId),
    onSuccess: () => {
      toast.success('Comment removed.');
      queryClient.invalidateQueries({ queryKey: ['me', 'community', 'comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['me', 'community', 'posts'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not delete.'),
  });
  const comments = commentsQ.data ?? [];
  // Silence unused warning if no group context is ever needed.
  void postGroupId;

  return (
    <div className="space-y-3 border-l-2 border-foreground/[0.05] pl-3">
      {comments.length === 0 && !commentsQ.isLoading && (
        <div className="text-xs text-foreground/55">No comments yet. Say something kind.</div>
      )}
      {comments.map((c) => {
        const isMine = myClientId !== null && c.author_client_id === myClientId;
        const canRemove = isMine || canModerateGroup;
        return (
          <div key={c.id} className="group/c text-xs">
            <div className="flex items-center gap-2 text-foreground/55">
              <span className="font-medium text-foreground">{c.author_display_name}</span>
              <span className="text-[9px] uppercase tracking-[0.18em]">{formatTime(c.created_at)}</span>
              {canRemove && (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm('Delete this comment?')) return;
                    deleteCommentMut.mutate(c.id);
                  }}
                  className="ml-auto opacity-0 transition-opacity hover:text-rose-600 group-hover/c:opacity-100"
                  aria-label="Delete comment"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
            <p className="mt-0.5 text-foreground/85">{c.content}</p>
          </div>
        );
      })}

      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (draft.trim()) addMut.mutate();
            }
          }}
          rows={1}
          placeholder="Add a comment…"
          maxLength={500}
          className="flex-1 resize-none rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-1.5 text-xs placeholder:text-foreground/40 focus:border-violet-400/50 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => addMut.mutate()}
          disabled={addMut.isPending || !draft.trim()}
          className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white disabled:opacity-40"
          aria-label="Send comment"
        >
          {addMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function GroupCard({ group, busy, onJoin }: { group: CommunityGroup; busy: boolean; onJoin: () => void }) {
  return (
    <Glass className="flex flex-col p-4">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 text-violet-600" />
        <div className="flex-1">
          <div className="text-sm font-semibold leading-tight">{group.name}</div>
          {group.description && (
            <div className="mt-1 text-xs text-foreground/65 line-clamp-2">{group.description}</div>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-foreground/55">
        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {group.member_count}</span>
        <button
          type="button"
          onClick={onJoin}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full border border-foreground/10 px-3 py-1 text-xs font-medium hover:bg-foreground/[0.05] disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          Join
        </button>
      </div>
    </Glass>
  );
}

function ManagePanel({ group, onClose }: { group: CommunityGroup; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isOwner = group.my_role === 'owner';

  const membersQ = useQuery({
    queryKey: ['me', 'community', 'members', group.id],
    queryFn: () => clientsApi.listGroupMembers(group.id),
    retry: 1,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['me', 'community', 'members', group.id] });
    queryClient.invalidateQueries({ queryKey: ['me', 'community', 'groups'] });
  };

  const kickMut = useMutation({
    mutationFn: (clientId: string) => clientsApi.kickMember(group.id, clientId),
    onSuccess: () => { toast.success('Removed from group.'); invalidate(); },
    onError: (err: Error) => toast.error(err.message ?? 'Could not kick member.'),
  });
  const statusMut = useMutation({
    mutationFn: ({ clientId, status }: { clientId: string; status: 'active' | 'muted' }) =>
      clientsApi.setMemberStatus(group.id, clientId, status),
    onSuccess: (_r, vars) => { toast.success(vars.status === 'muted' ? 'Muted.' : 'Unmuted.'); invalidate(); },
    onError: (err: Error) => toast.error(err.message ?? 'Could not update.'),
  });
  const roleMut = useMutation({
    mutationFn: ({ clientId, role }: { clientId: string; role: 'member' | 'moderator' }) =>
      clientsApi.setMemberRole(group.id, clientId, role),
    onSuccess: (_r, vars) => {
      toast.success(vars.role === 'moderator' ? 'Promoted to moderator.' : 'Demoted to member.');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not change role.'),
  });

  const members = membersQ.data ?? [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 grid place-items-center p-4 "
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-foreground/[0.08] bg-popover shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Manage</div>
            <div className="text-base font-semibold">{group.name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-foreground/65 hover:bg-foreground/[0.05]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {membersQ.isLoading ? (
            <div className="flex items-center justify-center p-6 text-sm text-foreground/55">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading members…
            </div>
          ) : members.length === 0 ? (
            <div className="p-6 text-center text-sm text-foreground/55">No members yet.</div>
          ) : (
            <ul className="divide-y divide-foreground/[0.05]">
              {members.map((m) => {
                const isMuted = m.status === 'muted';
                const isOwnerRow = m.role === 'owner';
                const isModRow = m.role === 'moderator';
                return (
                  <li key={m.client_id} className="flex items-center justify-between gap-3 px-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{m.name}</span>
                        {isOwnerRow && (
                          <span className="rounded-full bg-amber-500/15 px-1.5 py-0 text-[9px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">Owner</span>
                        )}
                        {isModRow && (
                          <span className="rounded-full bg-violet-500/15 px-1.5 py-0 text-[9px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-200">Mod</span>
                        )}
                        {isMuted && (
                          <span className="rounded-full bg-rose-500/15 px-1.5 py-0 text-[9px] uppercase tracking-[0.18em] text-rose-700 dark:text-rose-200">Muted</span>
                        )}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/45">
                        Joined {new Date(m.joined_at).toLocaleDateString()}
                      </div>
                    </div>
                    {!isOwnerRow && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => statusMut.mutate({
                            clientId: m.client_id,
                            status: isMuted ? 'active' : 'muted',
                          })}
                          disabled={statusMut.isPending}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-foreground/75 hover:bg-foreground/[0.05]"
                          title={isMuted ? 'Unmute' : 'Mute'}
                        >
                          {isMuted
                            ? <><Volume2 className="h-3 w-3" /> Unmute</>
                            : <><VolumeX className="h-3 w-3" /> Mute</>}
                        </button>
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => roleMut.mutate({
                              clientId: m.client_id,
                              role: isModRow ? 'member' : 'moderator',
                            })}
                            disabled={roleMut.isPending}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-foreground/75 hover:bg-foreground/[0.05]"
                            title={isModRow ? 'Demote' : 'Promote'}
                          >
                            {isModRow
                              ? <><ShieldOff className="h-3 w-3" /> Demote</>
                              : <><Shield   className="h-3 w-3" /> Mod</>}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (!confirm(`Remove ${m.name} from the group?`)) return;
                            kickMut.mutate(m.client_id);
                          }}
                          disabled={kickMut.isPending}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
                          title="Remove"
                        >
                          <UserX className="h-3 w-3" /> Kick
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-foreground/[0.06] bg-foreground/[0.02] px-5 py-3 text-[11px] text-foreground/55">
          {isOwner
            ? 'You can mute, promote/demote, or remove anyone except yourself.'
            : 'You can mute or remove regular members. The owner and other mods are off-limits.'}
        </footer>
      </motion.div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Challenge card + leaderboard panel
// ──────────────────────────────────────────────────────────────────

const METRIC_LABEL: Record<ChallengeMetric, string> = {
  water_ml:         'ml of water',
  exercise_minutes: 'minutes',
  posts:            'posts',
  streak_days:      'days',
};
const METRIC_ICON: Record<ChallengeMetric, typeof Flame> = {
  water_ml:         Droplets,
  exercise_minutes: ActivityIcon,
  posts:            PenSquare,
  streak_days:      Flame,
};

function ChallengeCard({
  group, busyJoin, onJoin, onOpen,
}: {
  group: CommunityGroup;
  busyJoin: boolean;
  onJoin: () => void;
  onOpen: () => void;
}) {
  const metric = group.target_metric;
  const Icon = metric ? METRIC_ICON[metric] : Flame;
  const daysLeft = group.ends_at
    ? Math.max(0, Math.ceil((new Date(group.ends_at).getTime() - Date.now()) / 86_400_000))
    : 0;

  return (
    <Glass className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold">{group.name}</div>
            {group.is_member && (
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0 text-[9px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">Joined</span>
            )}
          </div>
          {group.description && (
            <p className="mt-0.5 text-xs text-foreground/65 line-clamp-2">{group.description}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-foreground/[0.03] py-2">
          <div className="text-base font-semibold">{group.target_value ?? '—'}</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/55">
            {metric ? METRIC_LABEL[metric] : 'target'}
          </div>
        </div>
        <div className="rounded-xl bg-foreground/[0.03] py-2">
          <div className="text-base font-semibold">{daysLeft}</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/55">days left</div>
        </div>
        <div className="rounded-xl bg-foreground/[0.03] py-2">
          <div className="text-base font-semibold">{group.member_count}</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/55">in</div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        {!group.is_member && (
          <button
            type="button"
            onClick={onJoin}
            disabled={busyJoin}
            className="inline-flex items-center gap-1 rounded-full border border-foreground/15 px-3 py-1.5 text-xs font-medium hover:bg-foreground/[0.05] disabled:opacity-50"
          >
            {busyJoin && <Loader2 className="h-3 w-3 animate-spin" />}
            Join
          </button>
        )}
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.55)]"
        >
          <Trophy className="h-3 w-3" /> Leaderboard
        </button>
      </div>
    </Glass>
  );
}

function LeaderboardPanel({
  group, onClose, onJoin, joining,
}: {
  group: CommunityGroup;
  onClose: () => void;
  onJoin: () => void;
  joining: boolean;
}) {
  const lbQ = useQuery({
    queryKey: ['me', 'community', 'leaderboard', group.id],
    queryFn: () => clientsApi.groupLeaderboard(group.id),
    retry: 1,
    refetchOnWindowFocus: true,
  });
  const data = lbQ.data;
  const metric = group.target_metric;
  const unit = metric ? METRIC_LABEL[metric] : '';

  const daysLeft = group.ends_at
    ? Math.max(0, Math.ceil((new Date(group.ends_at).getTime() - Date.now()) / 86_400_000))
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 grid place-items-center p-4 "
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-foreground/[0.08] bg-popover shadow-2xl"
      >
        <header className="flex items-start justify-between gap-2 border-b border-foreground/[0.06] px-5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-amber-600 dark:text-amber-300">
              <Trophy className="h-3 w-3" /> Leaderboard
            </div>
            <div className="truncate text-base font-semibold">{group.name}</div>
            <div className="mt-0.5 flex items-center gap-3 text-[11px] text-foreground/55">
              <span className="inline-flex items-center gap-1"><Timer className="h-3 w-3" /> {daysLeft} days left</span>
              {group.target_value !== null && metric && (
                <span>Target: {group.target_value} {unit}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-foreground/65 hover:bg-foreground/[0.05]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {!group.is_member && (
          <div className="border-b border-foreground/[0.06] bg-amber-500/5 px-5 py-3 text-xs text-foreground/75">
            <div className="flex items-center justify-between gap-3">
              <span>Join this challenge to appear on the leaderboard.</span>
              <button
                type="button"
                onClick={onJoin}
                disabled={joining}
                className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {joining && <Loader2 className="h-3 w-3 animate-spin" />}
                Join
              </button>
            </div>
          </div>
        )}

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {lbQ.isLoading ? (
            <div className="flex items-center justify-center p-6 text-sm text-foreground/55">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading leaderboard…
            </div>
          ) : !data || data.entries.length === 0 ? (
            <div className="p-6 text-center text-sm text-foreground/55">
              No participants yet. Be the first to log progress.
            </div>
          ) : (
            <ol className="divide-y divide-foreground/[0.05]">
              {data.entries.slice(0, 50).map((e) => {
                const targetVal = group.target_value ?? 0;
                const pct = targetVal > 0 ? Math.min(100, Math.round((e.value / targetVal) * 100)) : 0;
                const completed = targetVal > 0 && e.value >= targetVal;
                return (
                  <li
                    key={e.client_id}
                    className={cn(
                      'px-3 py-2.5',
                      e.is_me && 'bg-violet-500/5',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        'grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-xs font-bold',
                        e.rank === 1 && 'bg-amber-500/20 text-amber-700 dark:text-amber-200',
                        e.rank === 2 && 'bg-foreground/10 text-foreground/85',
                        e.rank === 3 && 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
                        e.rank > 3  && 'bg-foreground/[0.04] text-foreground/65',
                      )}>
                        {e.rank}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{e.name}</span>
                          {e.is_me && (
                            <span className="rounded-full bg-violet-500/15 px-1.5 py-0 text-[9px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-200">You</span>
                          )}
                          {completed && (
                            <span className="rounded-full bg-emerald-500/15 px-1.5 py-0 text-[9px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">Done</span>
                          )}
                        </div>
                        {targetVal > 0 && (
                          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-fuchsia-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{e.value.toLocaleString()}</div>
                        <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/55">{unit}</div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {data && data.me_rank && (
          <footer className="border-t border-foreground/[0.06] bg-foreground/[0.02] px-5 py-3 text-xs text-foreground/75">
            You're at rank <strong className="text-foreground">#{data.me_rank}</strong>{' '}
            with <strong className="text-foreground">{data.me_value.toLocaleString()}</strong> {unit}.
          </footer>
        )}
      </motion.div>
    </motion.div>
  );
}

function formatTime(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 60)      return `${sec}s ago`;
  if (sec < 3600)    return `${Math.round(sec / 60)}m ago`;
  if (sec < 86_400)  return `${Math.round(sec / 3600)}h ago`;
  if (sec < 604_800) return `${Math.round(sec / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}