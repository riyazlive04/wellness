import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Card, Eyebrow, GradientButton, KeyboardAwareScroll, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { communityApi, type CommunityPost } from '@/lib/community-api';
import { brand, radius, spacing } from '@/lib/theme';

// Soft pastel fill alphas — matches Today/Progress (~0.10 light / ~0.18 dark).
const fill = (color: string, dark: boolean) => color + (dark ? '2E' : '1A');
const chipBg = (color: string) => color + '33';

// Stable-ish avatar tint from the author name so each person keeps a colour.
const AVATAR_TINTS = [brand.teal, brand.blue, brand.cyan, '#7C6BD6', '#3FAE88', '#F59E0B'];
function avatarTint(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

export default function Community() {
  const t = useTheme();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const q = useQuery({ queryKey: ['community', 'posts'], queryFn: () => communityApi.posts({ limit: 50 }), retry: 1 });

  const postMut = useMutation({
    mutationFn: (content: string) => communityApi.createPost({ content }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['community', 'posts'] }); setText(''); },
  });
  const reactMut = useMutation({
    mutationFn: (id: string) => communityApi.react(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community', 'posts'] }),
  });

  const posts = q.data ?? [];

  return (
    <Screen edges={[]}>
      <KeyboardAwareScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.colors.accent} />}>
        <View style={{ gap: 4 }}>
          <Eyebrow>Community</Eyebrow>
          <AppText variant="title">Share &amp; connect</AppText>
        </View>

        <Card style={{ gap: spacing.md, borderRadius: radius['2xl'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={[styles.iconChip, { backgroundColor: fill(t.colors.primary, t.dark) }]}>
              <Ionicons name="create-outline" size={18} color={t.colors.primary} />
            </View>
            <Eyebrow>Start a post</Eyebrow>
          </View>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Share something with the community…"
            placeholderTextColor={t.colors.textFaint}
            multiline
            style={[styles.input, { color: t.colors.text, backgroundColor: t.colors.surfaceStrong, borderColor: t.colors.border }]}
          />
          <GradientButton label="Post" onPress={() => text.trim() && postMut.mutate(text.trim())} loading={postMut.isPending} />
        </Card>

        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : posts.length === 0 ? (
          <Card
            style={{
              alignItems: 'center',
              gap: spacing.md,
              paddingVertical: spacing['2xl'],
              backgroundColor: fill(t.colors.primary, t.dark),
              borderColor: t.colors.primary + (t.dark ? '33' : '24'),
              borderRadius: radius['2xl'],
            }}>
            <View style={[styles.emptyChip, { backgroundColor: chipBg(t.colors.primary) }]}>
              <Ionicons name="people-outline" size={24} color={t.colors.primary} />
            </View>
            <AppText variant="heading">No posts yet</AppText>
            <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
              Be the first to share something with the community.
            </AppText>
          </Card>
        ) : (
          posts.map((p) => <PostCard key={p.id} p={p} onLike={() => reactMut.mutate(p.id)} />)
        )}
      </KeyboardAwareScroll>
    </Screen>
  );
}

function PostCard({ p, onLike }: { p: CommunityPost; onLike: () => void }) {
  const t = useTheme();
  const tint = avatarTint(p.author_name ?? '?');
  const liked = p.liked_by_me;
  return (
    <Card style={{ gap: spacing.md, borderRadius: radius['2xl'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={[styles.avatar, { backgroundColor: fill(tint, t.dark), borderColor: tint + (t.dark ? '3A' : '2B') }]}>
          <AppText variant="heading" style={{ color: tint }}>{(p.author_name?.[0] ?? '?').toUpperCase()}</AppText>
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="body" style={{ fontWeight: '600' }}>{p.author_name}</AppText>
          <AppText variant="caption" tone="faint">{new Date(p.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</AppText>
        </View>
      </View>
      <AppText variant="body" style={{ lineHeight: 21 }}>{p.content}</AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 2 }}>
        <Pressable
          onPress={onLike}
          style={[
            styles.actionPill,
            {
              backgroundColor: liked ? t.colors.danger + (t.dark ? '26' : '1A') : t.colors.surfaceStrong,
              borderColor: liked ? t.colors.danger + (t.dark ? '3A' : '2B') : t.colors.border,
            },
          ]}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={16} color={liked ? t.colors.danger : t.colors.textMuted} />
          <AppText variant="caption" style={{ color: liked ? t.colors.danger : t.colors.textMuted }}>{p.likes_count}</AppText>
        </Pressable>
        <View style={[styles.actionPill, { backgroundColor: t.colors.surfaceStrong, borderColor: t.colors.border }]}>
          <Ionicons name="chatbubble-outline" size={15} color={t.colors.textMuted} />
          <AppText variant="caption" tone="muted">{p.comments_count}</AppText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 72,
    fontSize: 15,
    textAlignVertical: 'top',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  iconChip: { width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  emptyChip: { width: 52, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
