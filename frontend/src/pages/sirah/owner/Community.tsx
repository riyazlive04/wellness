import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Users, Globe2, ArrowUp, Minus, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { PostCard } from '@/modules/workspace/community/components/PostCard';
import { PostComposer } from '@/modules/workspace/community/components/PostComposer';
import {
  COHORTS,
  MOCK_POSTS,
  TRENDING,
} from '@/modules/workspace/community/data/mockCommunity';
import type { Post, ReactionKey } from '@/modules/workspace/community/types';
import { cn } from '@/lib/utils';

export default function OwnerCommunity() {
  const workspace = readWorkspace();
  const [posts, setPosts] = useState<Post[]>(() => MOCK_POSTS);
  const [activeCohort, setActiveCohort] = useState<string>('all');

  const filteredPosts = useMemo(() => {
    const cohort = COHORTS.find((c) => c.id === activeCohort);
    if (!cohort || cohort.id === 'all') return posts;
    return posts.filter((p) => p.pinned || p.cohort === cohort.label);
  }, [posts, activeCohort]);

  // Pinned first, then chronological
  const orderedPosts = useMemo(() => {
    return [...filteredPosts].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });
  }, [filteredPosts]);

  function toggleReaction(postId: string, key: ReactionKey) {
    setPosts((all) =>
      all.map((p) => {
        if (p.id !== postId) return p;
        const has = p.reactedByMe.includes(key);
        return {
          ...p,
          reactedByMe: has ? p.reactedByMe.filter((k) => k !== key) : [...p.reactedByMe, key],
          reactions: {
            ...p.reactions,
            [key]: Math.max(0, p.reactions[key] + (has ? -1 : 1)),
          },
        };
      }),
    );
  }

  function handlePost(payload: { body: string; pin: boolean; cohort: string }) {
    const newPost: Post = {
      id: `p_${Math.random().toString(36).slice(2, 8)}`,
      author: { id: 'tm_owner', name: 'Dr. Sharma (You)', role: 'owner' },
      body: payload.body,
      hashtags: extractHashtags(payload.body),
      reactions: { cheer: 0, strength: 0, love: 0, celebrate: 0 },
      reactedByMe: [],
      commentCount: 0,
      comments: [],
      createdAt: new Date().toISOString(),
      pinned: payload.pin,
      cohort: payload.cohort,
    };
    setPosts((p) => [newPost, ...p]);
    toast.success(payload.pin ? 'Posted and pinned.' : 'Posted to the community.');
  }

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={`${posts.length} posts · ${posts.reduce((a, p) => a + p.commentCount, 0)} comments`}
      onSignOut={() => toast('Sign-out wiring lands with the auth context refactor.')}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-foreground/55">Community</span>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
                Where your clients meet
              </h1>
              <p className="mt-1 text-sm text-foreground/55">
                Wins, questions, recipes, and the quiet wins clients want to share with each other.
              </p>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
            {/* Feed column */}
            <motion.div variants={fadeUp} className="space-y-4">
              <PostComposer onPost={handlePost} />

              {/* Cohort tabs */}
              <Glass className="flex items-center gap-1 overflow-x-auto p-1">
                {COHORTS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveCohort(c.id)}
                    className={cn(
                      'flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                      activeCohort === c.id
                        ? 'bg-gradient-to-br from-blue-600/40 to-fuchsia-500/30 text-foreground'
                        : 'text-foreground/55 hover:text-foreground/85',
                    )}
                  >
                    {c.label}
                    <span className={cn(
                      'rounded-full px-1.5 py-0.5 text-[9px]',
                      activeCohort === c.id ? 'bg-foreground/15 text-foreground' : 'bg-foreground/[0.04] text-foreground/60',
                    )}>
                      {c.members}
                    </span>
                  </button>
                ))}
              </Glass>

              {/* Feed */}
              {orderedPosts.length === 0 ? (
                <Glass className="px-6 py-16 text-center">
                  <Globe2 className="mx-auto h-6 w-6 text-foreground/30" />
                  <h3 className="mt-3 text-base font-medium tracking-tight">No posts yet</h3>
                  <p className="mt-1 text-sm text-foreground/55">
                    When clients post or you announce something, it shows up here.
                  </p>
                </Glass>
              ) : (
                <div className="space-y-4">
                  {orderedPosts.map((p) => (
                    <PostCard key={p.id} post={p} onToggleReaction={toggleReaction} />
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
                    <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
                      Trending
                    </div>
                    <div className="text-sm font-medium text-foreground">This week</div>
                  </div>
                  <TrendingUp className="h-4 w-4 text-emerald-300/70" />
                </div>
                <ul className="divide-y divide-foreground/[0.04]">
                  {TRENDING.map((t) => (
                    <li key={t.tag}>
                      <button
                        type="button"
                        onClick={() => toast(`Filter by #${t.tag} ships with the search module.`)}
                        className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-xs transition-colors hover:bg-foreground/[0.03]"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-violet-300">#{t.tag}</div>
                          <div className="text-[10px] text-foreground/55">
                            {t.posts} {t.posts === 1 ? 'post' : 'posts'}
                          </div>
                        </div>
                        {t.trend === 'up' && <ArrowUp className="h-3.5 w-3.5 text-emerald-300" />}
                        {t.trend === 'down' && <ArrowDown className="h-3.5 w-3.5 text-rose-300" />}
                        {t.trend === 'flat' && <Minus className="h-3.5 w-3.5 text-foreground/55" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </Glass>

              {/* Moderation summary */}
              <Glass className="p-5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
                  Moderation
                </div>
                <div className="mt-3 space-y-3 text-xs">
                  <Row label="Flagged" value="0" tone="emerald" />
                  <Row label="Drafts" value="2" tone="neutral" />
                  <Row label="Engagement rate" value="64%" tone="indigo" />
                </div>
                <button
                  type="button"
                  onClick={() => toast('Community guidelines editor ships with the Settings module.')}
                  className="mt-4 w-full rounded-lg border border-foreground/10 bg-foreground/[0.03] py-1.5 text-xs text-foreground/85 hover:bg-foreground/[0.06]"
                >
                  Edit community guidelines
                </button>
              </Glass>

              {/* Cohort overview */}
              <Glass className="p-5">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
                    Cohorts
                  </div>
                  <Users className="h-3.5 w-3.5 text-foreground/55" />
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  {COHORTS.slice(1).map((c) => (
                    <div key={c.id} className="flex items-center justify-between">
                      <span className="text-foreground/65">{c.label}</span>
                      <span className="tabular-nums text-foreground/85">{c.members}</span>
                    </div>
                  ))}
                </div>
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
    ? 'text-emerald-300'
    : tone === 'indigo'
      ? 'text-violet-300'
      : 'text-foreground/85';
  return (
    <div className="flex items-center justify-between">
      <span className="text-foreground/55">{label}</span>
      <span className={cn('font-medium tabular-nums', c)}>{value}</span>
    </div>
  );
}

function extractHashtags(text: string): string[] {
  const tags: string[] = [];
  const regex = /#(\w+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (!tags.includes(match[1])) tags.push(match[1]);
  }
  return tags;
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
