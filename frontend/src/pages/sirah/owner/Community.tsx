import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { TrendingUp, Users, Globe2, ArrowUp, Minus, ArrowDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { PostCard } from '@/modules/workspace/community/components/PostCard';
import { PostComposer } from '@/modules/workspace/community/components/PostComposer';
import { communityApi } from '@/modules/workspace/api/community';
import { useOwnerIdentity } from '@/hooks/useOwnerIdentity';
import type { Post, ReactionKey } from '@/modules/workspace/community/types';
import { cn } from '@/lib/utils';

export default function OwnerCommunity() {
  const workspace = readWorkspace();
  const { ownerName } = useOwnerIdentity();
  const queryClient = useQueryClient();
  const [activeCohort, setActiveCohort] = useState<string>('all');

  const feedKey = ['community', 'feed', activeCohort] as const;
  const feedQ = useQuery({ queryKey: feedKey, queryFn: () => communityApi.feed(activeCohort) });
  const cohortsQ = useQuery({ queryKey: ['community', 'cohorts'], queryFn: () => communityApi.cohorts() });
  const trendingQ = useQuery({ queryKey: ['community', 'trending'], queryFn: () => communityApi.trending() });
  const moderationQ = useQuery({ queryKey: ['community', 'moderation'], queryFn: () => communityApi.moderation() });

  const posts = feedQ.data ?? [];
  const cohorts = cohortsQ.data ?? [];

  // "All cohorts" tab + the workspace's real groups.
  const cohortTabs = useMemo(
    () => [
      { id: 'all', label: 'All cohorts', members: cohorts.reduce((a, c) => a + c.members, 0) },
      ...cohorts,
    ],
    [cohorts],
  );

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['community'] });
  };

  const createMut = useMutation({
    mutationFn: (p: { content: string; pinned: boolean; cohortId?: string; imageUrl?: string | null }) =>
      communityApi.createPost({
        content: p.content,
        authorName: ownerName,
        pinned: p.pinned,
        cohortId: p.cohortId,
        imageUrl: p.imageUrl ?? undefined,
      }),
    onSuccess: (_d, p) => {
      invalidateAll();
      toast.success(p.pinned ? 'Posted and pinned.' : 'Posted to the community.');
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not post.'),
  });

  const reactMut = useMutation({
    mutationFn: (v: { postId: string; key: ReactionKey }) => communityApi.react(v.postId, v.key),
    // Optimistic toggle so the tap feels instant; reconcile on settle.
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: feedKey });
      const prev = queryClient.getQueryData<Post[]>(feedKey);
      queryClient.setQueryData<Post[]>(feedKey, (old) =>
        (old ?? []).map((p) => {
          if (p.id !== v.postId) return p;
          const has = p.reactedByMe.includes(v.key);
          return {
            ...p,
            reactedByMe: has ? p.reactedByMe.filter((k) => k !== v.key) : [...p.reactedByMe, v.key],
            reactions: { ...p.reactions, [v.key]: Math.max(0, p.reactions[v.key] + (has ? -1 : 1)) },
          };
        }),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(feedKey, ctx.prev);
      toast.error('Could not save your reaction.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKey }),
  });

  const pinMut = useMutation({
    mutationFn: (v: { postId: string; pinned: boolean }) => communityApi.pin(v.postId, v.pinned),
    onSuccess: (_d, v) => {
      void queryClient.invalidateQueries({ queryKey: ['community', 'feed'] });
      toast.success(v.pinned ? 'Pinned to top.' : 'Unpinned.');
    },
    onError: () => toast.error('Could not update the pin.'),
  });

  const deleteMut = useMutation({
    mutationFn: (postId: string) => communityApi.remove(postId),
    onSuccess: () => {
      invalidateAll();
      toast.success('Post deleted.');
    },
    onError: () => toast.error('Could not delete the post.'),
  });

  const commentMut = useMutation({
    mutationFn: (v: { postId: string; body: string }) =>
      communityApi.comment(v.postId, { content: v.body, authorName: ownerName }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['community', 'feed'] });
      toast.success('Comment posted.');
    },
    onError: () => toast.error('Could not post the comment.'),
  });

  function handlePost(payload: { body: string; pin: boolean; cohort: string; imageUrl?: string | null }) {
    const match = cohorts.find((c) => c.label === payload.cohort);
    createMut.mutate({ content: payload.body, pinned: payload.pin, cohortId: match?.id, imageUrl: payload.imageUrl });
  }

  const totalComments = posts.reduce((a, p) => a + p.commentCount, 0);

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={`${posts.length} posts · ${totalComments} comments`}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Community</span>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
                Where your clients meet
              </h1>
              <p className="mt-1 text-sm text-foreground/75 dark:text-foreground/55">
                Wins, questions, recipes, and the quiet wins clients want to share with each other.
              </p>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
            {/* Feed column */}
            <motion.div variants={fadeUp} className="space-y-4">
              <PostComposer onPost={handlePost} cohorts={cohorts} />

              {/* Cohort tabs */}
              <Glass className="flex items-center gap-1 overflow-x-auto p-1">
                {cohortTabs.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveCohort(c.id)}
                    className={cn(
                      'flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                      activeCohort === c.id
                        ? 'bg-gradient-to-br from-blue-600/40 to-fuchsia-500/30 text-foreground'
                        : 'text-foreground/75 dark:text-foreground/55 hover:text-foreground/85',
                    )}
                  >
                    {c.label}
                    <span className={cn(
                      'rounded-full px-1.5 py-0.5 text-[9px]',
                      activeCohort === c.id ? 'bg-foreground/15 text-foreground' : 'bg-foreground/[0.04] text-foreground/75 dark:text-foreground/60',
                    )}>
                      {c.members}
                    </span>
                  </button>
                ))}
              </Glass>

              {/* Feed */}
              {feedQ.isLoading ? (
                <Glass className="flex items-center justify-center px-6 py-16 text-sm text-foreground/55">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading the community…
                </Glass>
              ) : posts.length === 0 ? (
                <Glass className="px-6 py-16 text-center">
                  <Globe2 className="mx-auto h-6 w-6 text-foreground/30" />
                  <h3 className="mt-3 text-base font-medium tracking-tight">No posts yet</h3>
                  <p className="mt-1 text-sm text-foreground/75 dark:text-foreground/55">
                    When clients post or you announce something, it shows up here.
                  </p>
                </Glass>
              ) : (
                <div className="space-y-4">
                  {posts.map((p) => (
                    <PostCard
                      key={p.id}
                      post={p}
                      onToggleReaction={(postId, key) => reactMut.mutate({ postId, key })}
                      onPin={(postId, pinned) => pinMut.mutate({ postId, pinned })}
                      onDelete={(postId) => deleteMut.mutate(postId)}
                      onComment={(postId, body) => commentMut.mutate({ postId, body })}
                    />
                  ))}
                </div>
              )}
            </motion.div>

            {/* Right rail */}
            <motion.aside variants={fadeUp} className="space-y-4">
              {/* Trending */}
              <Glass className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                      Trending
                    </div>
                    <div className="text-sm font-medium text-foreground">This week</div>
                  </div>
                  <TrendingUp className="h-4 w-4 text-emerald-700 dark:text-emerald-300/70" />
                </div>
                {(trendingQ.data ?? []).length === 0 ? (
                  <div className="px-5 py-6 text-xs text-foreground/55">No trending tags yet this week.</div>
                ) : (
                  <ul className="divide-y divide-foreground/[0.04]">
                    {(trendingQ.data ?? []).map((t) => (
                      <li key={t.tag}>
                        <button
                          type="button"
                          onClick={() => toast(`Filter by #${t.tag} ships with the search module.`)}
                          className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-xs transition-colors hover:bg-foreground/[0.03]"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-violet-700 dark:text-violet-300">#{t.tag}</div>
                            <div className="text-[10px] text-foreground/75 dark:text-foreground/55">
                              {t.posts} {t.posts === 1 ? 'post' : 'posts'}
                            </div>
                          </div>
                          {t.trend === 'up' && <ArrowUp className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />}
                          {t.trend === 'down' && <ArrowDown className="h-3.5 w-3.5 text-rose-700 dark:text-rose-300" />}
                          {t.trend === 'flat' && <Minus className="h-3.5 w-3.5 text-foreground/75 dark:text-foreground/55" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Glass>

              {/* Moderation summary */}
              <Glass className="p-5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                  Moderation
                </div>
                <div className="mt-3 space-y-3 text-xs">
                  <Row label="Flagged" value={String(moderationQ.data?.flagged ?? 0)} tone={moderationQ.data?.flagged ? 'neutral' : 'emerald'} />
                  <Row label="Posts" value={String(moderationQ.data?.totalPosts ?? posts.length)} tone="neutral" />
                  <Row label="Engagement rate" value={`${moderationQ.data?.engagementRate ?? 0}%`} tone="indigo" />
                </div>
              </Glass>

              {/* Cohort overview */}
              <Glass className="p-5">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                    Cohorts
                  </div>
                  <Users className="h-3.5 w-3.5 text-foreground/75 dark:text-foreground/55" />
                </div>
                {cohorts.length === 0 ? (
                  <div className="mt-3 text-xs text-foreground/55">No cohorts yet.</div>
                ) : (
                  <div className="mt-3 space-y-2 text-xs">
                    {cohorts.map((c) => (
                      <div key={c.id} className="flex items-center justify-between">
                        <span className="text-foreground/80 dark:text-foreground/65">{c.label}</span>
                        <span className="tabular-nums text-foreground/85">{c.members}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Glass>
            </motion.aside>
          </div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'indigo' | 'neutral' }) {
  const c = tone === 'emerald'
    ? 'text-emerald-700 dark:text-emerald-300'
    : tone === 'indigo'
      ? 'text-violet-700 dark:text-violet-300'
      : 'text-foreground/85';
  return (
    <div className="flex items-center justify-between">
      <span className="text-foreground/75 dark:text-foreground/55">{label}</span>
      <span className={cn('font-medium tabular-nums', c)}>{value}</span>
    </div>
  );
}

interface WorkspaceSummary {
  practiceName: string;
  ownerName: string;
  initials: string;
}

function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }

  const initials = practiceName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'SL';

  return { practiceName, ownerName, initials };
}