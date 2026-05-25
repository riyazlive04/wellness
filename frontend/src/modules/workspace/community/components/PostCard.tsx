import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Pin, MoreVertical, Send } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import type { Post, ReactionKey } from '../types';
import { REACTION_META } from '../data/mockCommunity';
import { ROLE_CHIP, ROLE_LABEL, initialsOf, relativeTime } from '../helpers';

const REACTION_ORDER: ReactionKey[] = ['cheer', 'strength', 'love', 'celebrate'];

interface PostCardProps {
  post: Post;
  onToggleReaction: (postId: string, key: ReactionKey) => void;
}

export function PostCard({ post, onToggleReaction }: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const totalReactions = Object.values(post.reactions).reduce((a, b) => a + b, 0);

  function submitComment() {
    if (!newComment.trim()) return;
    toast.success('Comment posted.');
    setNewComment('');
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <Glass
        variant={post.pinned ? 'heavy' : 'default'}
        className={cn(
          'overflow-hidden',
          post.pinned && 'ring-1 ring-violet-400/30',
        )}
      >
        {/* Pinned banner */}
        {post.pinned && (
          <div className="flex items-center gap-1.5 border-b border-violet-400/20 bg-violet-400/[0.06] px-5 py-1.5 text-[10px] uppercase tracking-[0.18em] text-violet-200">
            <Pin className="h-3 w-3" />
            Pinned by the workspace owner
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-xs font-medium">
              {initialsOf(post.author.name)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{post.author.name}</span>
                <span
                  className={cn(
                    'rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em]',
                    ROLE_CHIP[post.author.role],
                  )}
                >
                  {ROLE_LABEL[post.author.role]}
                </span>
              </div>
              <div className="text-[11px] text-white/40">
                {relativeTime(post.createdAt)}
                {post.cohort && (
                  <>
                    <span className="mx-1.5 text-white/20">·</span>
                    <span>{post.cohort}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="grid h-7 w-7 place-items-center rounded-lg text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white"
              aria-label="More"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#15171C] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      toast.success(post.pinned ? 'Post unpinned.' : 'Post pinned to top.');
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white/80 hover:bg-white/[0.05]"
                  >
                    <Pin className="h-3.5 w-3.5" />
                    {post.pinned ? 'Unpin post' : 'Pin to top'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      toast('Flag flow will appear in the moderation module.');
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-amber-200 hover:bg-amber-300/[0.08]"
                  >
                    Flag for review
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      toast.success('Post deleted.');
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-rose-300 hover:bg-rose-500/[0.1]"
                  >
                    Delete post
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">{post.body}</p>
        </div>

        {/* Image */}
        {post.imageUrl && (
          <div className="px-5 pb-3">
            <PostImage url={post.imageUrl} />
          </div>
        )}

        {/* Hashtags */}
        {post.hashtags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-5 pb-3">
            {post.hashtags.map((h) => (
              <button
                key={h}
                type="button"
                className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[10px] text-violet-300 hover:bg-white/[0.05]"
              >
                #{h}
              </button>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center justify-between border-t border-white/[0.04] px-5 py-2.5 text-[11px] text-white/45">
          <div className="flex items-center gap-2">
            {totalReactions > 0 && (
              <>
                <div className="flex -space-x-1.5">
                  {REACTION_ORDER.filter((k) => post.reactions[k] > 0).slice(0, 3).map((k) => (
                    <span
                      key={k}
                      className="grid h-5 w-5 place-items-center rounded-full border border-[#0F1115] bg-white/[0.06] text-[10px]"
                      title={REACTION_META[k].label}
                    >
                      {REACTION_META[k].emoji}
                    </span>
                  ))}
                </div>
                <span>{totalReactions}</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowComments((s) => !s)}
            className="inline-flex items-center gap-1 hover:text-white"
          >
            <MessageCircle className="h-3 w-3" />
            {post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}
          </button>
        </div>

        {/* Reaction bar */}
        <div className="grid grid-cols-4 border-t border-white/[0.04]">
          {REACTION_ORDER.map((k) => {
            const meta = REACTION_META[k];
            const active = post.reactedByMe.includes(k);
            const count = post.reactions[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => onToggleReaction(post.id, k)}
                className={cn(
                  'flex items-center justify-center gap-1.5 py-2 text-xs transition-colors hover:bg-white/[0.03]',
                  active && 'bg-violet-400/[0.06] text-violet-200',
                )}
              >
                <span className="text-base leading-none">{meta.emoji}</span>
                <span className={cn(active ? 'text-violet-200' : 'text-white/55')}>
                  {count > 0 ? count : meta.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Comments */}
        {showComments && (
          <div className="space-y-3 border-t border-white/[0.04] px-5 py-3">
            {post.comments.length === 0 ? (
              <div className="text-xs text-white/40">Be the first to comment.</div>
            ) : (
              post.comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2.5">
                  <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-[10px] font-medium">
                    {initialsOf(c.author.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium text-white">{c.author.name}</span>
                        <span
                          className={cn(
                            'rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em]',
                            ROLE_CHIP[c.author.role],
                          )}
                        >
                          {ROLE_LABEL[c.author.role]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-white/85">{c.body}</p>
                    </div>
                    <div className="mt-1 text-[10px] text-white/35">{relativeTime(c.createdAt)}</div>
                  </div>
                </div>
              ))
            )}

            {/* Inline reply */}
            <div className="flex items-center gap-2 pt-2">
              <input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitComment();
                  }
                }}
                placeholder="Write a comment…"
                className="flex-1 rounded-full border border-white/[0.06] bg-white/[0.02] px-3.5 py-1.5 text-xs placeholder:text-white/30 focus:border-violet-400/50 focus:bg-white/[0.05] focus:outline-none"
              />
              <button
                type="button"
                onClick={submitComment}
                disabled={!newComment.trim()}
                className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white disabled:opacity-30"
                aria-label="Send"
              >
                <Send className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </Glass>
    </motion.article>
  );
}

function PostImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className="aspect-video w-full rounded-xl"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(125,190,157,0.25), rgba(15,17,21,0.95))',
        }}
      />
    );
  }
  return (
    <img
      src={url}
      alt="Post"
      className="aspect-video w-full rounded-xl object-cover"
      onError={() => setFailed(true)}
    />
  );
}
