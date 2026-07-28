import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Card, GradientButton, KeyboardAwareScroll, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { communityApi, type CommunityPost } from '@/lib/community-api';
import { spacing } from '@/lib/theme';

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
      <KeyboardAwareScroll refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.colors.accent} />}>
        <Card style={{ gap: spacing.sm }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Share something with the community…"
            placeholderTextColor={t.colors.textFaint}
            multiline
            style={[styles.input, { color: t.colors.text }]}
          />
          <GradientButton label="Post" onPress={() => text.trim() && postMut.mutate(text.trim())} loading={postMut.isPending} />
        </Card>

        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : posts.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
            <Ionicons name="people-outline" size={26} color={t.colors.textFaint} />
            <AppText variant="muted" tone="muted">Be the first to post.</AppText>
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
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="caption" tone="accent">{(p.author_name?.[0] ?? '?').toUpperCase()}</AppText>
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="body" style={{ fontWeight: '600' }}>{p.author_name}</AppText>
          <AppText variant="caption" tone="faint">{new Date(p.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</AppText>
        </View>
      </View>
      <AppText variant="body">{p.content}</AppText>
      <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: 2 }}>
        <Pressable onPress={onLike} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name={p.liked_by_me ? 'heart' : 'heart-outline'} size={18} color={p.liked_by_me ? t.colors.danger : t.colors.textMuted} />
          <AppText variant="caption" tone="muted">{p.likes_count}</AppText>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name="chatbubble-outline" size={16} color={t.colors.textMuted} />
          <AppText variant="caption" tone="muted">{p.comments_count}</AppText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 60, fontSize: 15, textAlignVertical: 'top' },
});
