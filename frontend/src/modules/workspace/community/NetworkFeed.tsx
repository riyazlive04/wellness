import { useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe2, Loader2, Send, MessageCircle, MoreVertical, ImagePlus, X, UserPlus, Check } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { networkApi, type NetworkPost, type NetworkReactionKey, type NetworkPerson } from '@/modules/workspace/api/network';
import { REACTION_META } from '@/modules/workspace/community/data/mockCommunity';
import { initialsOf, relativeTime } from '@/modules/workspace/community/helpers';
import { cn } from '@/lib/utils';

const FEED_BASE = ['network', 'feed'] as const;
const REACTION_ORDER: NetworkReactionKey[] = ['cheer', 'strength', 'love', 'celebrate'];

/** Friendly label for a workspace_member role. */
function roleLabel(role?: string | null): string | null {
  if (!role) return null;
  const map: Record<string, string> = {
    owner: 'Owner', manager: 'Manager', nutritionist: 'Nutritionist',
    assistant_nutritionist: 'Assistant', receptionist: 'Reception', coach: 'Coach', support: 'Support',
  };
  return map[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function roleChip(role?: string | null): string {
  if (role === 'owner') return 'border-teal-400/40 bg-teal-400/10 text-teal-700 dark:text-teal-200';
  if (role === 'manager') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200';
  return 'border-foreground/15 bg-foreground/[0.04] text-foreground/70';
}

export function NetworkFeed() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [filter, setFilter] = useState<'discover' | 'following'>('discover');
  const fileRef = useRef<HTMLInputElement>(null);

  const feedKey = [...FEED_BASE, filter] as const;
  const feedQ = useQuery({ queryKey: feedKey, queryFn: () => networkApi.feed(filter), refetchOnWindowFocus: true });
  const posts = feedQ.data ?? [];
  const followsQ = useQuery({ queryKey: ['network', 'follows'], queryFn: networkApi.follows });
  const invalidateFeeds = () => void qc.invalidateQueries({ queryKey: FEED_BASE });

  const createMut = useMutation({
    mutationFn: (v: { content: string; imageUrl: string | null }) => networkApi.createPost(v.content, v.imageUrl),
    onSuccess: () => { setDraft(''); setImage(null); invalidateFeeds(); toast.success('Posted to the network.'); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not post.'),
  });

  const reactMut = useMutation({
    mutationFn: (v: { id: string; reaction: NetworkReactionKey }) => networkApi.react(v.id, v.reaction),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: feedKey });
      const prev = qc.getQueryData<NetworkPost[]>(feedKey);
      qc.setQueryData<NetworkPost[]>(feedKey, (old) => (old ?? []).map((p) => {
        if (p.id !== v.id) return p;
        const has = p.reacted_by_me.includes(v.reaction);
        return {
          ...p,
          reacted_by_me: has ? p.reacted_by_me.filter((k) => k !== v.reaction) : [...p.reacted_by_me, v.reaction],
          reactions: { ...p.reactions, [v.reaction]: Math.max(0, p.reactions[v.reaction] + (has ? -1 : 1)) },
        };
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(feedKey, ctx.prev); toast.error('Could not save your reaction.'); },
    onSettled: () => void qc.invalidateQueries({ queryKey: feedKey }),
  });

  const commentMut = useMutation({
    mutationFn: (v: { id: string; content: string }) => networkApi.comment(v.id, v.content),
    onSuccess: () => invalidateFeeds(),
    onError: () => toast.error('Could not post the comment.'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => networkApi.remove(id),
    onSuccess: () => { invalidateFeeds(); toast.success('Post deleted.'); },
    onError: () => toast.error('Could not delete the post.'),
  });

  // Follow/unfollow a practitioner — optimistically flips every visible post by
  // that author, then reconciles on settle.
  const followMut = useMutation({
    mutationFn: (v: { userId: string; follow: boolean }) => (v.follow ? networkApi.follow(v.userId) : networkApi.unfollow(v.userId)),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: feedKey });
      const prev = qc.getQueryData<NetworkPost[]>(feedKey);
      qc.setQueryData<NetworkPost[]>(feedKey, (old) =>
        (old ?? []).map((p) => (p.author_user_id === v.userId ? { ...p, author_is_following: v.follow } : p)));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(feedKey, ctx.prev); toast.error('Could not update follow.'); },
    onSuccess: (_d, v) => toast.success(v.follow ? 'Following.' : 'Unfollowed.'),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['network'] }),
  });

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast.error('Please choose an image file.'); return; }
    setProcessing(true);
    try { setImage(await downscaleToDataUrl(f, 1280, 0.82)); }
    catch { toast.error('Could not process that image.'); }
    finally { setProcessing(false); }
  }

  function post() {
    const t = draft.trim();
    if ((t || image) && !createMut.isPending) createMut.mutate({ content: t, imageUrl: image });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
      {/* Discover / Following */}
      <div className="inline-flex items-center gap-1 rounded-full border border-foreground/[0.06] bg-card p-1 text-sm shadow-sm">
        {(['discover', 'following'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={cn('inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold capitalize transition-colors',
              filter === f ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-sm' : 'text-foreground/60 hover:bg-foreground/[0.05]')}>
            {f}
          </button>
        ))}
      </div>

      {/* Composer */}
      <Glass className="p-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-foreground/45">
          <Globe2 className="h-3.5 w-3.5 text-teal-500" /> Post to every practice on NUSI
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); post(); } }}
          rows={3}
          placeholder="Share a win, an idea, or a question with fellow nutritionists…"
          className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3.5 py-2.5 text-sm placeholder:text-foreground/40 focus:border-teal-400/50 focus:outline-none"
        />
        {image && (
          <div className="relative mt-2 inline-block overflow-hidden rounded-xl border border-foreground/10 bg-foreground/[0.03]">
            <img src={image} alt="attachment preview" className="max-h-56 w-auto max-w-full object-contain" />
            <button type="button" onClick={() => setImage(null)} aria-label="Remove image"
              className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={processing}
              className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-2.5 py-1.5 text-xs text-foreground/65 transition-colors hover:bg-foreground/[0.05] disabled:opacity-50">
              {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} Photo
            </button>
            <span className="hidden text-[10px] text-foreground/40 sm:inline">Visible to all practitioners</span>
          </div>
          <button type="button" onClick={post} disabled={(!draft.trim() && !image) || createMut.isPending || processing}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-1.5 text-xs font-medium text-white disabled:opacity-40">
            {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Post
          </button>
        </div>
      </Glass>

      {/* Feed */}
      {feedQ.isLoading ? (
        <Glass className="flex items-center justify-center px-6 py-16 text-sm text-foreground/55">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading the network…
        </Glass>
      ) : feedQ.isError ? (
        <Glass className="px-6 py-12 text-center">
          <Globe2 className="mx-auto h-6 w-6 text-foreground/30" />
          <h3 className="mt-3 text-base font-medium">Network unavailable</h3>
          <p className="mt-1 text-sm text-foreground/55">The nutritionist network isn't set up yet. If you're the admin, run the pending migration to enable it.</p>
        </Glass>
      ) : posts.length === 0 ? (
        <Glass className="px-6 py-16 text-center">
          <Globe2 className="mx-auto h-6 w-6 text-foreground/30" />
          <h3 className="mt-3 text-base font-medium tracking-tight">
            {filter === 'following' ? 'Nothing from people you follow yet' : 'No posts in the network yet'}
          </h3>
          <p className="mt-1 text-sm text-foreground/55">
            {filter === 'following'
              ? 'Follow a few practitioners in Discover and their posts show up here.'
              : 'Be the first to say hello to fellow practitioners across NUSI.'}
          </p>
        </Glass>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {posts.map((p) => (
              <NetworkPostCard
                key={p.id}
                post={p}
                onReact={(id, reaction) => reactMut.mutate({ id, reaction })}
                onComment={(id, content) => commentMut.mutate({ id, content })}
                onDelete={(id) => deleteMut.mutate(id)}
                onFollow={(userId, follow) => followMut.mutate({ userId, follow })}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
      </div>

      {/* Right rail - matches the "My practice" layout */}
      <aside className="space-y-4">
        <Glass className="p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Globe2 className="h-4 w-4 text-teal-500" /> Nutritionist network</div>
          <p className="text-xs leading-relaxed text-foreground/60">
            A shared professional feed across every practice on NUSI. Post wins, questions, and ideas - every practitioner sees them, and your clients never do.
          </p>
        </Glass>

        <FollowsCard
          followers={followsQ.data?.followers ?? []}
          following={followsQ.data?.following ?? []}
          loading={followsQ.isLoading}
          onFollow={(userId, follow) => followMut.mutate({ userId, follow })}
        />

        <Glass className="p-5">
          <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">Good posts</div>
          <ul className="space-y-2.5 text-xs text-foreground/70">
            <li className="flex gap-2"><span>🌿</span> Be supportive - celebrate peers' wins.</li>
            <li className="flex gap-2"><span>💡</span> Share knowledge, not client data.</li>
            <li className="flex gap-2"><span>🙌</span> Keep it professional and kind.</li>
          </ul>
        </Glass>
      </aside>
    </div>
  );
}

function NetworkPostCard({ post, onReact, onComment, onDelete, onFollow }: {
  post: NetworkPost;
  onReact: (id: string, reaction: NetworkReactionKey) => void;
  onComment: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onFollow: (userId: string, follow: boolean) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [showReactors, setShowReactors] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const total = REACTION_ORDER.reduce((a, k) => a + post.reactions[k], 0);

  function submit() {
    const b = newComment.trim();
    if (!b) return;
    onComment(post.id, b);
    setNewComment('');
  }

  return (
    <motion.article layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
      <Glass className="overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.30)] to-[hsl(var(--brand-magenta)_/_0.20)] text-xs font-medium">
              {initialsOf(post.author_practice)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{post.author_practice}{post.mine && ' · you'}</span>
                {roleLabel(post.author_role) && (
                  <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em]', roleChip(post.author_role))}>
                    {roleLabel(post.author_role)}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-foreground/75 dark:text-foreground/55">{relativeTime(post.created_at)}</div>
            </div>
          </div>

          {!post.mine && (
            <button type="button" onClick={() => onFollow(post.author_user_id, !post.author_is_following)}
              className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold transition-colors',
                post.author_is_following
                  ? 'border-foreground/10 bg-foreground/[0.04] text-foreground/60 hover:border-rose-400/40 hover:bg-rose-500/[0.06] hover:text-rose-500'
                  : 'border-teal-400/40 bg-teal-400/10 text-teal-700 hover:bg-teal-400/20 dark:text-teal-200')}>
              {post.author_is_following ? <><Check className="h-3 w-3" /> Following</> : <><UserPlus className="h-3 w-3" /> Follow</>}
            </button>
          )}

          {post.mine && (
            <div className="relative">
              <button type="button" onClick={() => setMenuOpen((o) => !o)}
                className="grid h-7 w-7 place-items-center rounded-lg text-foreground/75 dark:text-foreground/60 transition-colors hover:bg-foreground/[0.05] hover:text-foreground" aria-label="More">
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-foreground/10 bg-surface-2 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]">
                    <button type="button"
                      onClick={() => { setMenuOpen(false); if (confirm('Delete this post? This cannot be undone.')) onDelete(post.id); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-rose-700 dark:text-rose-300 hover:bg-rose-500/[0.1]">
                      Delete post
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        {post.content && (
          <div className="px-5 py-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{post.content}</p>
          </div>
        )}

        {/* Image */}
        {post.image_url && (
          <div className="px-5 pb-3">
            <a href={post.image_url} target="_blank" rel="noopener noreferrer"
              className="block overflow-hidden rounded-xl border border-foreground/[0.06] bg-foreground/[0.03]">
              <img src={post.image_url} alt="" className="mx-auto max-h-[30rem] w-full object-contain" />
            </a>
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center justify-between border-t border-foreground/[0.04] px-5 py-2.5 text-[11px] text-foreground/75 dark:text-foreground/60">
          {total > 0 ? (
            <button type="button" onClick={() => setShowReactors((s) => !s)}
              className="flex items-center gap-2 rounded-md transition-colors hover:text-foreground" title="See who reacted">
              <div className="flex -space-x-1.5">
                {REACTION_ORDER.filter((k) => post.reactions[k] > 0).slice(0, 3).map((k) => (
                  <span key={k} className="grid h-5 w-5 place-items-center rounded-full border border-surface bg-foreground/[0.06] text-[10px]" title={REACTION_META[k].label}>
                    {REACTION_META[k].emoji}
                  </span>
                ))}
              </div>
              <span>{total}</span>
            </button>
          ) : <span />}
          <button type="button" onClick={() => setShowComments((s) => !s)} className="inline-flex items-center gap-1 hover:text-foreground">
            <MessageCircle className="h-3 w-3" />
            {post.comment_count} {post.comment_count === 1 ? 'comment' : 'comments'}
          </button>
        </div>

        {/* Who reacted */}
        {showReactors && total > 0 && (
          <div className="border-t border-foreground/[0.04] px-5 py-3">
            <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-foreground/45">Who reacted</div>
            <div className="space-y-1.5">
              {post.reactors.map((r, i) => (
                <div key={`${r.user_id}-${r.reaction}-${i}`} className="flex items-center gap-2 text-xs">
                  <span className="text-sm leading-none">{REACTION_META[r.reaction].emoji}</span>
                  <span className="font-medium text-foreground/85">{r.practice}{r.mine && ' · you'}</span>
                  {roleLabel(r.role) && (
                    <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em]', roleChip(r.role))}>{roleLabel(r.role)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reaction bar */}
        <div className="grid grid-cols-4 border-t border-foreground/[0.04]">
          {REACTION_ORDER.map((k) => {
            const active = post.reacted_by_me.includes(k);
            const count = post.reactions[k];
            return (
              <button key={k} type="button" onClick={() => onReact(post.id, k)}
                className={cn('flex items-center justify-center gap-1.5 py-2 text-xs transition-colors hover:bg-foreground/[0.03]',
                  active && 'bg-teal-400/[0.06] text-teal-700 dark:text-teal-200')}>
                <span className="text-base leading-none">{REACTION_META[k].emoji}</span>
                <span className={cn(active ? 'text-teal-700 dark:text-teal-200' : 'text-foreground/75 dark:text-foreground/55')}>
                  {count > 0 ? count : REACTION_META[k].label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Comments */}
        {showComments && (
          <div className="space-y-3 border-t border-foreground/[0.04] px-5 py-3">
            {post.comments.length === 0 ? (
              <div className="text-xs text-foreground/75 dark:text-foreground/55">Be the first to comment.</div>
            ) : (
              post.comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2.5">
                  <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.30)] to-[hsl(var(--brand-magenta)_/_0.20)] text-[10px] font-medium">
                    {initialsOf(c.author_practice)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="rounded-xl bg-foreground/[0.04] px-3 py-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium text-foreground">{c.author_practice}{c.mine && ' · you'}</span>
                        {roleLabel(c.author_role) && (
                          <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em]', roleChip(c.author_role))}>
                            {roleLabel(c.author_role)}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-foreground/85">{c.content}</p>
                    </div>
                    <div className="mt-1 text-[10px] text-foreground/35">{relativeTime(c.created_at)}</div>
                  </div>
                </div>
              ))
            )}

            {/* Inline reply */}
            <div className="flex items-center gap-2 pt-2">
              <input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
                placeholder="Write a comment…"
                className="flex-1 rounded-full border border-foreground/[0.06] bg-foreground/[0.02] px-3.5 py-1.5 text-xs placeholder:text-foreground/60 focus:border-teal-400/50 focus:bg-foreground/[0.05] focus:outline-none"
              />
              <button type="button" onClick={submit} disabled={!newComment.trim()}
                className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white disabled:opacity-30" aria-label="Send">
                <Send className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </Glass>
    </motion.article>
  );
}

/** Rail card: who follows you + who you follow, with follow-back buttons. */
function FollowsCard({ followers, following, loading, onFollow }: {
  followers: NetworkPerson[];
  following: NetworkPerson[];
  loading: boolean;
  onFollow: (userId: string, follow: boolean) => void;
}) {
  const [tab, setTab] = useState<'followers' | 'following'>('followers');
  const list = tab === 'followers' ? followers : following;
  return (
    <Glass className="overflow-hidden p-0">
      <div className="grid grid-cols-2 border-b border-foreground/[0.06]">
        {(['followers', 'following'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={cn('flex flex-col items-center gap-0.5 py-3 text-xs font-bold transition-colors',
              tab === t ? 'bg-foreground/[0.03] text-foreground' : 'text-foreground/55 hover:bg-foreground/[0.02]')}>
            <span className="text-lg tabular-nums">{t === 'followers' ? followers.length : following.length}</span>
            <span className="capitalize">{t}</span>
          </button>
        ))}
      </div>
      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-foreground/50"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : list.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-foreground/50">
            {tab === 'followers' ? 'No one follows you yet. Post to Discover to get noticed.' : 'You’re not following anyone yet. Tap Follow on a post.'}
          </p>
        ) : (
          <ul className="divide-y divide-foreground/[0.04]">
            {list.map((p) => (
              <li key={p.user_id} className="flex items-center gap-2.5 px-4 py-2.5">
                <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.30)] to-[hsl(var(--brand-magenta)_/_0.20)] text-[10px] font-medium">
                  {initialsOf(p.practice)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-foreground">{p.practice}</div>
                  {roleLabel(p.role) && <div className="text-[10px] text-foreground/50">{roleLabel(p.role)}</div>}
                </div>
                <button type="button" onClick={() => onFollow(p.user_id, !p.i_follow)}
                  className={cn('flex-shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors',
                    p.i_follow
                      ? 'border-foreground/10 bg-foreground/[0.04] text-foreground/60 hover:border-rose-400/40 hover:text-rose-500'
                      : 'border-teal-400/40 bg-teal-400/10 text-teal-700 hover:bg-teal-400/20 dark:text-teal-200')}>
                  {p.i_follow ? 'Following' : 'Follow back'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Glass>
  );
}

/** Read an image File → downscaled JPEG data URL (longest edge `max` px). */
async function downscaleToDataUrl(file: File, max = 1280, quality = 0.82): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new window.Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not decode the image.'));
    i.src = raw;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}
