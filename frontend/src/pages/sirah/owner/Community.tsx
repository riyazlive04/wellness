import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  TrendingUp, Users, Globe2, ArrowUp, Minus, ArrowDown, Loader2,
  Heart, Sparkles, Shield, ShieldCheck, MessageCircle, Flag, Plus, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { optimistic } from '@/lib/optimistic';
import { PostCard } from '@/modules/workspace/community/components/PostCard';
import { PostComposer } from '@/modules/workspace/community/components/PostComposer';
import { NetworkFeed } from '@/modules/workspace/community/NetworkFeed';
import { communityApi } from '@/modules/workspace/api/community';
import { useOwnerIdentity } from '@/hooks/useOwnerIdentity';
import type { Post, ReactionKey, Cohort } from '@/modules/workspace/community/types';
import { cn } from '@/lib/utils';

export default function OwnerCommunity() {
  const workspace = readWorkspace();
  const { ownerName } = useOwnerIdentity();
  const queryClient = useQueryClient();
  const [activeCohort, setActiveCohort] = useState<string>('all');
  const [view, setView] = useState<'practice' | 'network'>('practice');

  // One-time community entry gate. Owners host/moderate the space, so we ask
  // them to accept the guidelines once before entering. Remembered per browser
  // (keyed by workspace) — owners have no client-style profile row to stamp.
  const gateKey = `sirah:community:accepted:${workspace.workspaceId ?? 'default'}`;
  const [accepted, setAccepted] = useState<boolean>(() => {
    try { return localStorage.getItem(gateKey) === '1'; } catch { return false; }
  });
  function acceptCommunity() {
    try { localStorage.setItem(gateKey, '1'); } catch { /* ignore */ }
    setAccepted(true);
  }

  if (!accepted) {
    return (
      <OwnerLayout
        practiceName={workspace.practiceName}
        ownerName={workspace.ownerName}
        initials={workspace.initials}
        trialDaysLeft={28}
      >
        <OwnerCommunityGate practiceName={workspace.practiceName} onAccept={acceptCommunity} />
      </OwnerLayout>
    );
  }

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

  const createCohortMut = useMutation({
    mutationFn: (name: string) => communityApi.createCohort(name),
    onSuccess: () => { invalidateAll(); toast.success('Cohort created.'); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not create cohort.'),
  });
  const deleteCohortMut = useMutation({
    mutationFn: (cohortId: string) => communityApi.deleteCohort(cohortId),
    onSuccess: () => {
      invalidateAll();
      // If the deleted cohort was the active filter, fall back to the whole feed.
      setActiveCohort((c) => c);
      toast.success('Cohort deleted. Its posts moved to the main feed.');
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not delete cohort.'),
  });

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

  // Optimistic: the pin flips instantly (same pattern as reactMut above).
  const pinMut = useMutation({
    mutationFn: (v: { postId: string; pinned: boolean }) => communityApi.pin(v.postId, v.pinned),
    ...optimistic<Post[], { postId: string; pinned: boolean }>(
      queryClient,
      feedKey,
      (old, v) => old.map((p) => (p.id === v.postId ? { ...p, pinned: v.pinned } : p)),
      { errorMessage: 'Could not update the pin.' },
    ),
    onSuccess: (_d, v) => toast.success(v.pinned ? 'Pinned to top.' : 'Unpinned.'),
  });

  // Optimistic: the post vanishes from the feed the instant you delete it.
  const deleteMut = useMutation({
    mutationFn: (postId: string) => communityApi.remove(postId),
    ...optimistic<Post[], string>(
      queryClient,
      feedKey,
      (old, postId) => old.filter((p) => p.id !== postId),
      { errorMessage: 'Could not delete the post.', also: [['community']] },
    ),
    onSuccess: () => toast.success('Post deleted.'),
  });

  // Optimistic: the comment appears (and the count bumps) before the write lands.
  const commentMut = useMutation({
    mutationFn: (v: { postId: string; body: string }) =>
      communityApi.comment(v.postId, { content: v.body, authorName: ownerName }),
    ...optimistic<Post[], { postId: string; body: string }>(
      queryClient,
      feedKey,
      (old, v) =>
        old.map((p) =>
          p.id === v.postId
            ? {
                ...p,
                commentCount: p.commentCount + 1,
                comments: [
                  ...p.comments,
                  {
                    id: `tmp_${Date.now()}`,
                    author: { id: 'me', name: ownerName, role: 'owner' },
                    body: v.body,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : p,
        ),
      { errorMessage: 'Could not post the comment.', also: [['community', 'feed']] },
    ),
    onSuccess: () => toast.success('Comment posted.'),
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
          {/* Header - hero with live stats */}
          <motion.div variants={fadeUp}>
            <Glass className="relative overflow-hidden p-6 md:p-7">
              <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.14)] to-[hsl(var(--brand-magenta)_/_0.10)] blur-2xl" />
              <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.30)] to-[hsl(var(--brand-magenta)_/_0.20)] text-teal-600 dark:text-teal-300">
                    <Globe2 className="h-7 w-7" />
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-[0.18em] text-foreground/60">Community</span>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Where your clients meet</h1>
                    <p className="mt-1 max-w-md text-sm text-foreground/60">
                      Wins, questions, recipes, and the quiet wins clients want to share with each other.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <HeaderStat icon={Globe2} label="Posts" value={posts.length} />
                  <HeaderStat icon={MessageCircle} label="Comments" value={totalComments} />
                  <HeaderStat icon={Heart} label="Engaged" value={`${moderationQ.data?.engagementRate ?? 0}%`} />
                </div>
              </div>
            </Glass>
          </motion.div>

          {/* My-practice vs global-network toggle */}
          <motion.div variants={fadeUp} className="flex justify-center">
            <div className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] p-1 text-sm">
              <ViewTab active={view === 'practice'} onClick={() => setView('practice')} icon={Users} label="My practice" />
              <ViewTab active={view === 'network'} onClick={() => setView('network')} icon={Globe2} label="Nutritionist network" />
            </div>
          </motion.div>

          {view === 'network' ? (
            <motion.div variants={fadeUp}>
              <NetworkFeed />
            </motion.div>
          ) : (
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
                        ? 'bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.40)] to-[hsl(var(--brand-magenta)_/_0.30)] text-foreground'
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
                <RailHead icon={TrendingUp} title="Trending" subtitle="This week" color="emerald" />
                {(trendingQ.data ?? []).length === 0 ? (
                  <RailEmpty icon={TrendingUp} text="No trending tags yet this week." />
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
                            <div className="truncate font-medium text-teal-700 dark:text-teal-300">#{t.tag}</div>
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
              <Glass className="overflow-hidden">
                <RailHead icon={ShieldCheck} title="Moderation" subtitle="Health of your space" color="teal" />
                <div className="grid grid-cols-3 gap-2 p-4">
                  <ModStat
                    icon={(moderationQ.data?.flagged ?? 0) > 0 ? Flag : ShieldCheck}
                    label="Flagged"
                    value={String(moderationQ.data?.flagged ?? 0)}
                    color={(moderationQ.data?.flagged ?? 0) > 0 ? 'rose' : 'emerald'}
                  />
                  <ModStat icon={Globe2} label="Posts" value={String(moderationQ.data?.totalPosts ?? posts.length)} color="teal" />
                  <ModStat icon={Heart} label="Engaged" value={`${moderationQ.data?.engagementRate ?? 0}%`} color="indigo" />
                </div>
              </Glass>

              {/* Cohorts */}
              <Glass className="overflow-hidden">
                <CohortsRail
                  cohorts={cohorts}
                  onCreate={(name) => createCohortMut.mutate(name)}
                  onDelete={(id) => deleteCohortMut.mutate(id)}
                  creating={createCohortMut.isPending}
                  deletingId={deleteCohortMut.isPending ? deleteCohortMut.variables ?? null : null}
                />
              </Glass>
            </motion.aside>
          </div>
          )}
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

function ViewTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Users; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
        active ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-sm' : 'text-foreground/65 hover:bg-foreground/[0.05]')}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────
// One-time community entry gate (welcome + guidelines + accept)
// ──────────────────────────────────────────────────────────────────

const OWNER_GUIDELINES: { icon: typeof Heart; title: string; body: string }[] = [
  { icon: Heart,    title: 'Set the tone',   body: 'Lead with encouragement. Your posts model how clients talk to each other.' },
  { icon: Sparkles, title: 'Celebrate wins', body: 'Spotlight progress and small wins to keep the community motivated.' },
  { icon: Shield,   title: 'Keep it safe',   body: 'Moderate spam and off-topic posts. Protect clients’ privacy and medical details.' },
];

function OwnerCommunityGate({ practiceName, onAccept }: { practiceName: string; onAccept: () => void }) {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="w-full"
      >
        <AIGlow intensity="soft" animated>
          <Glass variant="heavy" className="p-7 text-center md:p-9">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.30)] to-[hsl(var(--brand-magenta)_/_0.20)] text-teal-600 dark:text-teal-300">
              <Users className="h-7 w-7" />
            </div>
            <div className="mt-4 text-[11px] uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/55">
              {practiceName} · Community
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Welcome to your community space</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-foreground/75 dark:text-foreground/65">
              This is where your clients meet, share wins, and support each other -
              and you host it. A few principles to keep it thriving:
            </p>

            <div className="mt-6 space-y-3 text-left">
              {OWNER_GUIDELINES.map((g) => (
                <div key={g.title} className="flex items-start gap-3 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] p-3.5">
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-foreground/[0.04] text-teal-600 dark:text-teal-300">
                    <g.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{g.title}</div>
                    <div className="mt-0.5 text-xs text-foreground/75 dark:text-foreground/65">{g.body}</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={onAccept}
              className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-6 py-3 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(14,154,168,0.6)] transition-opacity"
            >
              <ShieldCheck className="h-4 w-4" />
              Accept &amp; enter community
            </button>
            <p className="mt-3 text-[11px] text-foreground/45">
              You can always come back here - we’ll only ask once.
            </p>
          </Glass>
        </AIGlow>
      </motion.div>
    </div>
  );
}

/** Shared rail palette — tinted icon chip + accent, works in light & dark. */
const TONES: Record<string, { tint: string; fg: string }> = {
  emerald: { tint: 'bg-emerald-500/10', fg: 'text-emerald-600 dark:text-emerald-400' },
  teal:    { tint: 'bg-teal-500/10',    fg: 'text-teal-600 dark:text-teal-400' },
  indigo:  { tint: 'bg-indigo-500/10',  fg: 'text-indigo-600 dark:text-indigo-400' },
  violet:  { tint: 'bg-violet-500/10',  fg: 'text-violet-600 dark:text-violet-400' },
  rose:    { tint: 'bg-rose-500/10',    fg: 'text-rose-600 dark:text-rose-400' },
};

/** Compact stat pill for the community header. */
function HeaderStat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <div className="flex min-w-[82px] flex-col items-center rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] px-4 py-2.5 text-center">
      <Icon className="mb-1 h-4 w-4 text-teal-600 dark:text-teal-300" />
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-foreground/50">{label}</div>
    </div>
  );
}

/** Rail card header: tinted icon chip + title (+ optional subtitle / right slot). */
function CohortsRail({ cohorts, onCreate, onDelete, creating, deletingId }: {
  cohorts: Cohort[];
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  creating: boolean;
  deletingId: string | null;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  function submit() {
    const n = name.trim();
    if (!n || creating) return;
    onCreate(n);
    setName('');
    setAdding(false);
  }

  return (
    <>
      <RailHead
        icon={Users}
        title="Cohorts"
        color="violet"
        right={
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[10px] font-medium text-foreground/70 transition-colors hover:bg-foreground/[0.09]"
          >
            {adding ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {adding ? 'Cancel' : 'New'}
          </button>
        }
      />

      {adding && (
        <div className="flex items-center gap-2 px-5 pb-2 pt-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setAdding(false); setName(''); } }}
            maxLength={80}
            placeholder="Cohort name, e.g. January Challenge"
            className="min-w-0 flex-1 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-2.5 py-1.5 text-xs focus:border-teal-400/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim() || creating}
            className="inline-flex h-7 items-center gap-1 rounded-lg bg-teal-600 px-2.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-40"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
          </button>
        </div>
      )}

      {cohorts.length === 0 && !adding ? (
        <RailEmpty icon={Users} text="No cohorts yet — group clients to run focused challenges." />
      ) : (
        <ul className="divide-y divide-foreground/[0.04]">
          {cohorts.map((c) => (
            <li key={c.id} className="group/cohort flex items-center justify-between px-5 py-2.5 text-xs">
              <span className="min-w-0 truncate text-foreground/80 dark:text-foreground/65">{c.label}</span>
              <span className="flex flex-shrink-0 items-center gap-2">
                <span className="inline-flex items-center gap-1 tabular-nums text-foreground/85">
                  <Users className="h-3 w-3 text-foreground/40" />{c.members}
                </span>
                <button
                  type="button"
                  onClick={() => { if (window.confirm(`Delete the "${c.label}" cohort? Its posts stay, moved to the main feed.`)) onDelete(c.id); }}
                  disabled={deletingId === c.id}
                  aria-label={`Delete ${c.label}`}
                  className="text-foreground/30 opacity-0 transition-opacity hover:text-rose-500 group-hover/cohort:opacity-100 disabled:opacity-40"
                >
                  {deletingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function RailHead({ icon: Icon, title, subtitle, color, right }: {
  icon: typeof Users; title: string; subtitle?: string; color: string; right?: React.ReactNode;
}) {
  const c = TONES[color] ?? TONES.teal;
  return (
    <div className="flex items-center justify-between gap-2 border-b border-foreground/[0.06] px-5 py-3.5">
      <div className="flex items-center gap-2.5">
        <div className={cn('grid h-8 w-8 place-items-center rounded-lg', c.tint, c.fg)}><Icon className="h-4 w-4" /></div>
        <div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {subtitle && <div className="text-[11px] text-foreground/50">{subtitle}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

/** Colored stat tile for the moderation summary. */
function ModStat({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: string; color: string }) {
  const c = TONES[color] ?? TONES.teal;
  return (
    <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-2.5 text-center">
      <div className={cn('mx-auto grid h-7 w-7 place-items-center rounded-lg', c.tint, c.fg)}><Icon className="h-3.5 w-3.5" /></div>
      <div className="mt-1.5 text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-foreground/50">{label}</div>
    </div>
  );
}

/** Muted empty state for a rail card. */
function RailEmpty({ icon: Icon, text }: { icon: typeof Users; text: string }) {
  return (
    <div className="grid place-items-center gap-2 px-5 py-8 text-center">
      <Icon className="h-6 w-6 text-foreground/20" />
      <span className="text-xs text-foreground/50">{text}</span>
    </div>
  );
}

interface WorkspaceSummary {
  practiceName: string;
  ownerName: string;
  initials: string;
  workspaceId: string | null;
}

function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  let workspaceId: string | null = null;
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
      if (d?.workspaceId) workspaceId = d.workspaceId;
    }
  } catch { /* ignore */ }

  const initials = practiceName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'SL';

  return { practiceName, ownerName, initials, workspaceId };
}