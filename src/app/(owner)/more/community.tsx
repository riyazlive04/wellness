/**
 * Community — ports the web Community page.
 *
 * The practice's shared feed: post as the practice, moderate (pin / delete),
 * react, comment, filter by cohort, and see what's trending. Moderation counts
 * sit at the top because they're the reason an owner opens this screen.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';

import {
  ActionButton,
  EmptyState,
  Field,
  IconButton,
  ListRow,
  Loading,
  OwnerPage,
  Pill,
  RouteGate,
  SegmentedTabs,
  Sheet,
  StatTile,
  TileRow,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useOwner } from '@/contexts/owner-context';
import { useTheme } from '@/hooks/use-theme';
import { communityApi } from '@/lib/owner/api/community';
import type { Post, ReactionKey } from '@/lib/owner/types/community';
import { initials, pct, relativeTime, titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

const REACTIONS: { key: ReactionKey; emoji: string }[] = [
  { key: 'cheer', emoji: '👏' },
  { key: 'strength', emoji: '💪' },
  { key: 'love', emoji: '❤️' },
  { key: 'celebrate', emoji: '🎉' },
];

export default function OwnerCommunity() {
  return (
    <RouteGate permission="community.use" feature="community" featureLabel="Community">
      <CommunityInner />
    </RouteGate>
  );
}

function CommunityInner() {
  const t = useTheme();
  const qc = useQueryClient();
  const { scope } = useOwner();
  const [cohort, setCohort] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [commentOn, setCommentOn] = useState<Post | null>(null);

  const authorName = scope?.email?.split('@')[0] ?? 'Practice';

  const feedQ = useQuery({ queryKey: ['community', 'feed', cohort], queryFn: () => communityApi.feed(cohort) });
  const cohortsQ = useQuery({ queryKey: ['community', 'cohorts'], queryFn: communityApi.cohorts });
  const trendingQ = useQuery({ queryKey: ['community', 'trending'], queryFn: communityApi.trending });
  const moderationQ = useQuery({ queryKey: ['community', 'moderation'], queryFn: communityApi.moderation });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['community'] });

  const react = useMutation({
    mutationFn: ({ postId, reaction }: { postId: string; reaction: ReactionKey }) =>
      communityApi.react(postId, reaction),
    onSuccess: refresh,
  });
  const pin = useMutation({
    mutationFn: ({ postId, pinned }: { postId: string; pinned: boolean }) => communityApi.pin(postId, pinned),
    onSuccess: refresh,
    onError: (e: Error) => Alert.alert('Could not pin', e.message),
  });
  const remove = useMutation({
    mutationFn: (postId: string) => communityApi.remove(postId),
    onSuccess: refresh,
    onError: (e: Error) => Alert.alert('Could not delete', e.message),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([feedQ.refetch(), trendingQ.refetch(), moderationQ.refetch()]);
    setRefreshing(false);
  };

  const m = moderationQ.data;

  return (
    <OwnerPage
      title="Community"
      subtitle="Your practice's shared feed"
      back
      actions={<IconButton icon="create-outline" tone="accent" accessibilityLabel="New post" onPress={() => setComposeOpen(true)} />}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
      }>
      {m ? (
        <TileRow>
          <StatTile label="Posts" value={m.totalPosts} icon="chatbox-outline" />
          <StatTile label="Engagement" value={pct(m.engagementRate)} icon="pulse-outline" />
          <StatTile
            label="Flagged"
            value={m.flagged}
            icon="flag-outline"
            tint={m.flagged ? t.colors.danger : undefined}
          />
        </TileRow>
      ) : null}

      {cohortsQ.data?.length ? (
        <SegmentedTabs
          options={[
            { key: 'all', label: 'Everyone' },
            ...cohortsQ.data.map((c) => ({ key: c.id, label: `${c.label} · ${c.members}` })),
          ]}
          value={cohort}
          onChange={setCohort}
        />
      ) : null}

      {trendingQ.data?.length ? (
        <Card style={{ gap: spacing.xs }}>
          <AppText variant="label" tone="faint">
            TRENDING
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
            {trendingQ.data.map((tag) => (
              <Pill
                key={tag.tag}
                label={`#${tag.tag} · ${tag.posts}`}
                tone={tag.trend === 'up' ? 'success' : tag.trend === 'down' ? 'neutral' : 'accent'}
              />
            ))}
          </View>
        </Card>
      ) : null}

      {feedQ.isLoading ? (
        <Loading />
      ) : feedQ.isError ? (
        <QueryError error={feedQ.error} onRetry={() => void feedQ.refetch()} lockedFeature="Community" />
      ) : !feedQ.data?.length ? (
        <EmptyState
          icon="globe-outline"
          title="Nothing posted yet"
          body="Start the conversation — a weekly prompt tends to get the first replies flowing."
          action={
            <View style={{ alignSelf: 'stretch', marginTop: spacing.sm }}>
              <ActionButton label="Write a post" icon="create-outline" onPress={() => setComposeOpen(true)} />
            </View>
          }
        />
      ) : (
        feedQ.data.map((post) => (
          <Card key={post.id} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: t.colors.surfaceStrong,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <AppText variant="caption" tone="accent">
                  {initials(post.author.name)}
                </AppText>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="body" numberOfLines={1}>
                  {post.author.name}
                </AppText>
                <AppText variant="caption" tone="faint">
                  {titleCase(post.author.role)} · {relativeTime(post.createdAt)}
                  {post.cohort ? ` · ${post.cohort}` : ''}
                </AppText>
              </View>
              {post.pinned ? <Pill label="Pinned" tone="accent" /> : null}
            </View>

            <AppText variant="body">{post.body}</AppText>

            {post.hashtags.length ? (
              <AppText variant="caption" tone="accent">
                {post.hashtags.map((h) => `#${h}`).join(' ')}
              </AppText>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              {REACTIONS.map((r) => (
                <AppText
                  key={r.key}
                  variant="caption"
                  tone={post.reactedByMe.includes(r.key) ? 'accent' : 'faint'}
                  onPress={() => react.mutate({ postId: post.id, reaction: r.key })}>
                  {r.emoji} {post.reactions[r.key] ?? 0}
                </AppText>
              ))}
              <AppText variant="caption" tone="muted" onPress={() => setCommentOn(post)}>
                💬 {post.commentCount}
              </AppText>
              <View style={{ flex: 1 }} />
              <AppText
                variant="caption"
                tone="muted"
                onPress={() => pin.mutate({ postId: post.id, pinned: !post.pinned })}>
                {post.pinned ? 'Unpin' : 'Pin'}
              </AppText>
              <AppText
                variant="caption"
                tone="danger"
                onPress={() =>
                  Alert.alert('Delete post?', 'It disappears for everyone.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(post.id) },
                  ])
                }>
                Delete
              </AppText>
            </View>
          </Card>
        ))
      )}

      <ComposeSheet
        visible={composeOpen}
        authorName={authorName}
        cohorts={cohortsQ.data ?? []}
        onClose={() => setComposeOpen(false)}
      />
      <CommentsSheet post={commentOn} authorName={authorName} onClose={() => setCommentOn(null)} />
    </OwnerPage>
  );
}

function ComposeSheet({
  visible,
  authorName,
  cohorts,
  onClose,
}: {
  visible: boolean;
  authorName: string;
  cohorts: { id: string; label: string }[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [content, setContent] = useState('');
  const [cohortId, setCohortId] = useState('all');
  const [pinned, setPinned] = useState(false);

  const post = useMutation({
    mutationFn: () =>
      communityApi.createPost({
        content: content.trim(),
        authorName,
        pinned,
        cohortId: cohortId === 'all' ? undefined : cohortId,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      setContent('');
      setPinned(false);
      onClose();
    },
    onError: (e: Error) => Alert.alert('Could not post', e.message),
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="New post">
      <Field
        label="Post"
        value={content}
        onChangeText={setContent}
        multiline
        placeholder="Share a win, a tip, or this week's challenge. #hashtags work."
        style={{ minHeight: 130, textAlignVertical: 'top' }}
      />
      {cohorts.length ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" tone="muted">
            AUDIENCE
          </AppText>
          <SegmentedTabs
            options={[{ key: 'all', label: 'Everyone' }, ...cohorts.map((c) => ({ key: c.id, label: c.label }))]}
            value={cohortId}
            onChange={setCohortId}
          />
        </View>
      ) : null}
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" tone="muted">
          PIN TO TOP
        </AppText>
        <SegmentedTabs
          options={[
            { key: 'no', label: 'No' },
            { key: 'yes', label: 'Pin it' },
          ]}
          value={pinned ? 'yes' : 'no'}
          onChange={(v) => setPinned(v === 'yes')}
        />
      </View>
      <ActionButton
        label="Post"
        disabled={!content.trim()}
        loading={post.isPending}
        onPress={() => post.mutate()}
      />
    </Sheet>
  );
}

function CommentsSheet({
  post,
  authorName,
  onClose,
}: {
  post: Post | null;
  authorName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');

  const comment = useMutation({
    mutationFn: () => communityApi.comment(post!.id, { content: draft.trim(), authorName }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      setDraft('');
    },
    onError: (e: Error) => Alert.alert('Could not comment', e.message),
  });

  return (
    <Sheet visible={!!post} onClose={onClose} title="Comments">
      {!post?.comments.length ? (
        <EmptyState icon="chatbubble-outline" title="No comments yet" />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {post.comments.map((c) => (
            <ListRow
              key={c.id}
              title={c.author.name}
              subtitle={c.body}
              avatarText={initials(c.author.name)}
              meta={relativeTime(c.createdAt)}
            />
          ))}
        </Card>
      )}
      <Field
        label="Reply"
        value={draft}
        onChangeText={setDraft}
        multiline
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />
      <ActionButton
        label="Comment"
        disabled={!draft.trim()}
        loading={comment.isPending}
        onPress={() => comment.mutate()}
      />
    </Sheet>
  );
}
