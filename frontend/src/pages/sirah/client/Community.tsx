import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Users, Heart, MessageCircle, Send, Loader2, Award,
  Sparkles, Plus, X, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type CommunityGroup, type CommunityPost } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

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
        className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Together · Community</span>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">You're not alone.</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65">
            Groups, challenges, and a steady feed of small wins from your wellness community.
          </p>
        </motion.div>

        {/* Featured group banner */}
        {featured && (
          <motion.div variants={fadeUp} className="mt-6">
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
                onReact={() => reactMut.mutate(p.id)}
                expanded={commentingOn === p.id}
                onToggleComments={() => setCommentingOn(commentingOn === p.id ? null : p.id)}
              />
            ))
          )}
        </motion.div>

        {/* Discover groups */}
        {discoverable.length > 0 && (
          <motion.div variants={fadeUp} className="mt-8">
            <h2 className="mb-3 text-base font-semibold">Discover groups</h2>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
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

        {/* Your groups, with a leave option */}
        {myGroups.length > 0 && (
          <motion.div variants={fadeUp} className="mt-8">
            <h2 className="mb-3 text-base font-semibold">Your groups</h2>
            <div className="space-y-2">
              {myGroups.map((g) => (
                <Glass key={g.id} className="flex items-center justify-between p-3">
                  <div>
                    <div className="text-sm font-medium">{g.name}</div>
                    <div className="text-xs text-foreground/55">{g.member_count} members</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => leaveMut.mutate(g.id)}
                    disabled={leaveMut.isPending && leaveMut.variables === g.id}
                    className="rounded-full px-3 py-1 text-xs text-foreground/65 hover:bg-foreground/[0.05] hover:text-foreground"
                  >
                    {leaveMut.isPending && leaveMut.variables === g.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Leave'}
                  </button>
                </Glass>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
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

function PostCard({ post, onReact, expanded, onToggleComments }: {
  post: CommunityPost;
  onReact: () => void;
  expanded: boolean;
  onToggleComments: () => void;
}) {
  const initials = post.author_display_name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
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
                <CommentsSection postId={post.id} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Glass>
  );
}

function CommentsSection({ postId }: { postId: string }) {
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
  const comments = commentsQ.data ?? [];

  return (
    <div className="space-y-3 border-l-2 border-foreground/[0.05] pl-3">
      {comments.length === 0 && !commentsQ.isLoading && (
        <div className="text-xs text-foreground/55">No comments yet. Say something kind.</div>
      )}
      {comments.map((c) => (
        <div key={c.id} className="text-xs">
          <div className="flex items-center gap-2 text-foreground/55">
            <span className="font-medium text-foreground">{c.author_display_name}</span>
            <span className="text-[9px] uppercase tracking-[0.18em]">{formatTime(c.created_at)}</span>
          </div>
          <p className="mt-0.5 text-foreground/85">{c.content}</p>
        </div>
      ))}

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