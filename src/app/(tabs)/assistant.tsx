import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { assistantApi, type AssistantMessage } from '@/lib/assistant-api';
import { radius, spacing } from '@/lib/theme';

const TAB_BAR_HEIGHT = 56;
const BOOT_KEY = ['assistant', 'boot'] as const;

interface Boot {
  profile: Awaited<ReturnType<typeof assistantApi.me>>;
  conversationId: string;
  messages: AssistantMessage[];
}

export default function Assistant() {
  const t = useTheme();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const tabH = TAB_BAR_HEIGHT + insets.bottom;
  const [text, setText] = useState('');
  const tempId = useRef(0);

  const bootQ = useQuery<Boot>({
    queryKey: BOOT_KEY,
    queryFn: async () => {
      const profile = await assistantApi.me();
      const convs = await assistantApi.listConversations();
      const conv = convs[0] ?? (await assistantApi.createConversation());
      const { messages } = await assistantApi.getConversation(conv.id);
      return { profile, conversationId: conv.id, messages };
    },
    staleTime: Infinity,
    retry: 1,
  });

  const boot = bootQ.data;

  const appendMessage = (msg: AssistantMessage) =>
    qc.setQueryData<Boot>(BOOT_KEY, (old) =>
      old ? { ...old, messages: [...old.messages, msg] } : old,
    );

  const sendMut = useMutation({
    mutationFn: (content: string) => assistantApi.sendMessage(boot!.conversationId, content),
    onMutate: (content: string) => {
      appendMessage({
        id: `tmp-${tempId.current++}`,
        conversation_id: boot?.conversationId ?? '',
        role: 'user',
        content,
        tokens: null,
        latency_ms: null,
        actions: [],
        created_at: new Date().toISOString(),
      });
    },
    onSuccess: (reply) => appendMessage(reply),
  });

  const onSend = (override?: string) => {
    const content = (override ?? text).trim();
    if (!content || !boot || sendMut.isPending) return;
    setText('');
    sendMut.mutate(content);
  };

  // Newest first for the inverted list.
  const data = useMemo(() => [...(boot?.messages ?? [])].reverse(), [boot?.messages]);

  if (bootQ.isLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.colors.accent} />
        </View>
      </Screen>
    );
  }

  if (bootQ.isError || !boot) {
    return (
      <Screen>
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={28} color={t.colors.textFaint} />
          <AppText variant="heading">Assistant unavailable</AppText>
          <AppText variant="muted" tone="muted" style={{ textAlign: 'center', maxWidth: 260 }}>
            Couldn&apos;t reach the assistant. Check your connection and try again.
          </AppText>
          <Pressable onPress={() => bootQ.refetch()}>
            <AppText variant="body" tone="accent">
              Retry
            </AppText>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const profile = boot.profile;
  const isEmpty = data.length === 0;

  return (
    <Screen edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: t.colors.border }]}>
        <LinearGradient colors={t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mark}>
          <Ionicons name="sparkles" size={16} color={t.colors.onBrand} />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{profile.name}</AppText>
          <AppText variant="caption" tone={profile.aiConfigured ? 'success' : 'muted'}>
            {profile.aiConfigured ? 'AI ready' : profile.role}
          </AppText>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={tabH}>
        {isEmpty ? (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
            <Card style={{ gap: spacing.sm }}>
              <AppText variant="heading">{profile.greeting}</AppText>
              {profile.capabilities.length ? (
                <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
                  {profile.capabilities.slice(0, 5).map((c) => (
                    <View key={c} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
                      <Ionicons name="checkmark-circle" size={15} color={t.colors.accent} style={{ marginTop: 2 }} />
                      <AppText variant="muted" tone="muted" style={{ flex: 1 }}>
                        {c}
                      </AppText>
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>

            <View style={{ gap: spacing.sm }}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} onPress={() => onSend(s)}>
                  <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Ionicons name="arrow-forward-circle-outline" size={18} color={t.colors.accent} />
                    <AppText variant="body" style={{ flex: 1 }}>
                      {s}
                    </AppText>
                  </Card>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            data={data}
            inverted
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
            renderItem={({ item }) => <Bubble msg={item} />}
          />
        )}

        {/* Composer */}
        <View
          style={[
            styles.composer,
            { borderTopColor: t.colors.border, backgroundColor: t.colors.canvas, paddingBottom: tabH + spacing.sm },
          ]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Ask your assistant…"
            placeholderTextColor={t.colors.textFaint}
            multiline
            style={[
              styles.input,
              { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border },
            ]}
          />
          <Pressable
            onPress={() => onSend()}
            disabled={!text.trim() || sendMut.isPending}
            style={[styles.sendBtn, { backgroundColor: text.trim() ? t.colors.primary : t.colors.surfaceStrong }]}>
            {sendMut.isPending ? (
              <ActivityIndicator size="small" color={t.colors.onBrand} />
            ) : (
              <Ionicons name="arrow-up" size={20} color={text.trim() ? t.colors.onBrand : t.colors.textFaint} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const SUGGESTIONS = [
  'How am I doing this week?',
  'Suggest a healthy dinner idea',
  'Give me a motivation boost',
];

function Bubble({ msg }: { msg: AssistantMessage }) {
  const t = useTheme();
  const mine = msg.role === 'user';
  return (
    <View
      style={[
        styles.bubble,
        {
          alignSelf: mine ? 'flex-end' : 'flex-start',
          backgroundColor: mine ? t.colors.primary : t.colors.surface,
          borderColor: mine ? 'transparent' : t.colors.border,
          borderTopRightRadius: mine ? 4 : radius.lg,
          borderTopLeftRadius: mine ? radius.lg : 4,
        },
      ]}>
      <AppText variant="body" tone={mine ? 'onBrand' : 'text'}>
        {msg.content}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mark: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    maxWidth: '86%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
