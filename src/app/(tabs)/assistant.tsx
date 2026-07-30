import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { useTheme } from '@/hooks/use-theme';
import { assistantApi, type AssistantMessage } from '@/lib/assistant-api';
import { brand, radius, spacing } from '@/lib/theme';

const TAB_BAR_HEIGHT = 56;
const BOOT_KEY = ['assistant', 'boot'] as const;

/** Soft brand tint — a low-alpha wash of a brand/teal hue for chips & bubbles. */
function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

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
  const kbVisible = useKeyboardVisible();
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
          <View style={[styles.errChip, { backgroundColor: tint(brand.teal, t.dark ? 0.16 : 0.1) }]}>
            <Ionicons name="cloud-offline-outline" size={28} color={t.colors.primary} />
          </View>
          <AppText variant="heading">Assistant unavailable</AppText>
          <AppText variant="muted" tone="muted" style={{ textAlign: 'center', maxWidth: 260 }}>
            Couldn&apos;t reach the assistant. Check your connection and try again.
          </AppText>
          <Pressable
            onPress={() => bootQ.refetch()}
            style={[styles.retryPill, { backgroundColor: tint(brand.teal, t.dark ? 0.2 : 0.12) }]}>
            <Ionicons name="refresh" size={15} color={t.colors.primary} />
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
      {/* Header — gradient assistant mark + status pill */}
      <View style={[styles.header, { borderBottomColor: t.colors.border }]}>
        <LinearGradient colors={t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mark}>
          <Ionicons name="sparkles" size={17} color={t.colors.onBrand} />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{profile.name}</AppText>
          <AppText variant="caption" tone="faint">
            AI wellness companion
          </AppText>
        </View>
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: profile.aiConfigured
                ? tint(brand.cyan, t.dark ? 0.2 : 0.13)
                : t.colors.surfaceStrong,
            },
          ]}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: profile.aiConfigured ? t.colors.success : t.colors.textFaint },
            ]}
          />
          <AppText variant="caption" tone={profile.aiConfigured ? 'success' : 'muted'}>
            {profile.aiConfigured ? 'AI ready' : profile.role}
          </AppText>
        </View>
      </View>

      {/* keyboardVerticalOffset stays 0: RN ADDS it to the padding it computes,
          so passing tabH here while the composer also pads by tabH left the
          input floating two tab-bars above the keys. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}>
        {isEmpty ? (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
            {/* Morning-brief style gradient welcome card */}
            <Card style={{ padding: 0, overflow: 'hidden', borderRadius: radius['2xl'] }}>
              <LinearGradient
                colors={t.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ padding: spacing.xl, gap: spacing.md }}>
                <View style={styles.welcomeMark}>
                  <Ionicons name="sparkles" size={18} color={t.colors.onBrand} />
                </View>
                <AppText variant="heading" tone="onBrand">
                  {profile.greeting}
                </AppText>
                {profile.capabilities.length ? (
                  <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
                    {profile.capabilities.slice(0, 5).map((c) => (
                      <View key={c} style={styles.capRow}>
                        <View style={styles.capChip}>
                          <Ionicons name="checkmark" size={12} color={t.colors.onBrand} />
                        </View>
                        <AppText variant="muted" tone="onBrand" style={{ flex: 1, opacity: 0.92 }}>
                          {c}
                        </AppText>
                      </View>
                    ))}
                  </View>
                ) : null}
              </LinearGradient>
            </Card>

            {/* Suggestion chips — rounded pills with soft teal tint */}
            <View style={{ gap: spacing.sm }}>
              <AppText variant="label" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
                Try asking
              </AppText>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} onPress={() => onSend(s)}>
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.suggestion,
                        {
                          backgroundColor: tint(brand.teal, t.dark ? 0.12 : 0.07),
                          borderColor: tint(brand.teal, t.dark ? 0.3 : 0.18),
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}>
                      <View style={[styles.suggestChip, { backgroundColor: tint(brand.cyan, t.dark ? 0.24 : 0.15) }]}>
                        <Ionicons name="sparkles-outline" size={15} color={t.colors.accent} />
                      </View>
                      <AppText variant="body" style={{ flex: 1 }}>
                        {s}
                      </AppText>
                      <Ionicons name="arrow-forward" size={16} color={t.colors.textFaint} />
                    </View>
                  )}
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
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
            // Inverted list: the header renders at the visual bottom, just above
            // the composer — the natural spot for a "thinking" indicator right
            // after the user's just-sent message.
            ListHeaderComponent={sendMut.isPending ? <Thinking /> : null}
            renderItem={({ item }) => <Bubble msg={item} />}
          />
        )}

        {/* Composer — pill input + gradient send button */}
        <View
          style={[
            styles.composer,
            {
              borderTopColor: t.colors.border,
              backgroundColor: t.colors.canvas,
              // Clear the floating tab bar only while it's actually visible —
              // once the keyboard covers it, this padding is just a gap.
              paddingBottom: kbVisible ? spacing.sm : tabH + spacing.sm,
            },
          ]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Ask your assistant…"
            placeholderTextColor={t.colors.textFaint}
            multiline
            style={[
              styles.input,
              {
                backgroundColor: t.colors.surfaceStrong,
                color: t.colors.text,
                borderColor: text.trim() ? tint(brand.teal, t.dark ? 0.4 : 0.28) : t.colors.border,
              },
            ]}
          />
          <Pressable
            onPress={() => onSend()}
            disabled={!text.trim() || sendMut.isPending}
            style={styles.sendBtn}>
            {text.trim() ? (
              <LinearGradient
                colors={t.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendFill}>
                {sendMut.isPending ? (
                  <ActivityIndicator size="small" color={t.colors.onBrand} />
                ) : (
                  <Ionicons name="arrow-up" size={20} color={t.colors.onBrand} />
                )}
              </LinearGradient>
            ) : (
              <View style={[styles.sendFill, { backgroundColor: t.colors.surfaceStrong }]}>
                <Ionicons name="arrow-up" size={20} color={t.colors.textFaint} />
              </View>
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

  if (mine) {
    return (
      <View style={[styles.bubbleWrap, { alignSelf: 'flex-end' }]}>
        <LinearGradient
          colors={t.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.bubble, { borderTopRightRadius: radius.sm }]}>
          <AppText variant="body" tone="onBrand">
            {msg.content}
          </AppText>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={[styles.bubbleWrap, { alignSelf: 'flex-start', flexDirection: 'row', gap: spacing.sm }]}>
      <LinearGradient colors={t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.botMark}>
        <Ionicons name="sparkles" size={13} color={t.colors.onBrand} />
      </LinearGradient>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: tint(brand.teal, t.dark ? 0.12 : 0.07),
            borderColor: tint(brand.teal, t.dark ? 0.28 : 0.16),
            borderWidth: StyleSheet.hairlineWidth,
            borderTopLeftRadius: radius.sm,
          },
        ]}>
        <AppText variant="body" tone="text">
          {msg.content}
        </AppText>
      </View>
    </View>
  );
}

/** Subtle three-dot "thinking" indicator in an assistant-styled bubble. */
function Thinking() {
  const t = useTheme();
  const dots = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current];

  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(d, { toValue: 1, duration: 360, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.3, duration: 360, useNativeDriver: true }),
          Animated.delay((dots.length - 1 - i) * 160),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.bubbleWrap, { alignSelf: 'flex-start', flexDirection: 'row', gap: spacing.sm }]}>
      <LinearGradient colors={t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.botMark}>
        <Ionicons name="sparkles" size={13} color={t.colors.onBrand} />
      </LinearGradient>
      <View
        style={[
          styles.bubble,
          styles.thinking,
          {
            backgroundColor: tint(brand.teal, t.dark ? 0.12 : 0.07),
            borderColor: tint(brand.teal, t.dark ? 0.28 : 0.16),
            borderWidth: StyleSheet.hairlineWidth,
            borderTopLeftRadius: radius.sm,
          },
        ]}>
        {dots.map((d, i) => (
          <Animated.View
            key={i}
            style={[styles.dot, { backgroundColor: t.colors.primary, opacity: d }]}
          />
        ))}
      </View>
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
  errChip: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  retryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radius.pill,
    marginTop: spacing.xs,
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
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
  },
  welcomeMark: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  capRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  capChip: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  suggestChip: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleWrap: {
    maxWidth: '88%',
  },
  botMark: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  bubble: {
    flexShrink: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.xl,
  },
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: spacing.md,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
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
    minHeight: 46,
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  sendFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
