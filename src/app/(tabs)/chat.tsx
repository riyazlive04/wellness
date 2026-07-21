import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type ClientMessage } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

// Approx bottom-tab height (bar + safe-area inset). expo-router SDK 57 doesn't
// hoist @react-navigation/bottom-tabs, so we estimate instead of the hook.
const TAB_BAR_HEIGHT = 56;

export default function Chat() {
  const t = useTheme();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const tabH = TAB_BAR_HEIGHT + insets.bottom;
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const msgsQ = useQuery({
    queryKey: ['me', 'messages'],
    queryFn: () => clientsApi.myMessages(80),
    refetchInterval: 5000, // near-realtime without socket.io (v1)
    retry: 1,
  });
  const nutriQ = useQuery({
    queryKey: ['me', 'nutritionist'],
    queryFn: () => clientsApi.myNutritionist(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const sendMut = useMutation({
    mutationFn: (content: string) => clientsApi.sendMessage(content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'messages'] }),
  });

  // Mark read on open.
  useEffect(() => {
    clientsApi.markMyMessagesRead().catch(() => {});
  }, []);

  // Newest first for the inverted list.
  const data = useMemo(
    () =>
      [...(msgsQ.data ?? [])].sort(
        (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
      ),
    [msgsQ.data],
  );

  const onSend = () => {
    const content = text.trim();
    if (!content || sendMut.isPending) return;
    setText('');
    sendMut.mutate(content);
  };

  const nutriName = nutriQ.data?.name ?? 'Your nutritionist';

  return (
    <Screen edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: t.colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: t.colors.surfaceStrong }]}>
          <Ionicons name="person" size={18} color={t.colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{nutriName}</AppText>
          <AppText variant="caption" tone="muted">
            {nutriQ.data?.tagline ?? 'Wellness coach'}
          </AppText>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={tabH}>
        {msgsQ.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : data.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="chatbubble-ellipses-outline" size={28} color={t.colors.textFaint} />
            <AppText variant="muted" tone="muted" style={{ textAlign: 'center', maxWidth: 260 }}>
              No messages yet. Say hello to {nutriName.split(' ')[0]} 👋
            </AppText>
          </View>
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
            {
              borderTopColor: t.colors.border,
              backgroundColor: t.colors.canvas,
              // tabH already includes the bottom safe-area inset.
              paddingBottom: tabH + spacing.sm,
            },
          ]}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor={t.colors.textFaint}
            multiline
            style={[
              styles.input,
              { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border },
            ]}
          />
          <Pressable
            onPress={onSend}
            disabled={!text.trim() || sendMut.isPending}
            style={[
              styles.sendBtn,
              { backgroundColor: text.trim() ? t.colors.primary : t.colors.surfaceStrong },
            ]}>
            {sendMut.isPending ? (
              <ActivityIndicator size="small" color={t.colors.onBrand} />
            ) : (
              <Ionicons
                name="arrow-up"
                size={20}
                color={text.trim() ? t.colors.onBrand : t.colors.textFaint}
              />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Bubble({ msg }: { msg: ClientMessage }) {
  const t = useTheme();
  const mine = msg.sender_type === 'client';
  const system = msg.sender_type === 'system';
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
      {system ? (
        <AppText variant="caption" tone="faint" style={{ textTransform: 'uppercase' }}>
          System
        </AppText>
      ) : null}
      <AppText variant="body" tone={mine ? 'onBrand' : 'text'}>
        {msg.content}
      </AppText>
      <AppText
        variant="caption"
        tone={mine ? 'onBrand' : 'faint'}
        style={{ alignSelf: 'flex-end', marginTop: 2, opacity: mine ? 0.8 : 1 }}>
        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
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
    paddingTop: 12,
    paddingBottom: 12,
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
