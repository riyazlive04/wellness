/**
 * AI Assistant — ports the web AIAssistant page.
 *
 * The backend resolves which assistant the caller gets (executive / clinical /
 * wellness) from their identity, so this screen just renders whatever profile
 * comes back: the morning brief, conversations, chat with suggested actions,
 * and the assistant's memory.
 *
 * Suggested actions that mutate anything ask for confirmation before running —
 * the assistant proposes, the nutritionist decides.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import {
  ActionButton,
  EmptyState,
  IconButton,
  ListRow,
  Loading,
  OwnerHeader,
  Pill,
  RouteGate,
  Sheet,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card, KeyboardAvoider, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { assistantApi, type AssistantMessage, type SuggestedAction } from '@/lib/owner/api/assistant';
import { clockTime, relativeTime } from '@/lib/owner/format';
import { font, radius, spacing } from '@/lib/theme';

export default function OwnerAI() {
  return (
    <RouteGate permission="ai.use" feature="ai_assistant" featureLabel="AI Assistant">
      <AIInner />
    </RouteGate>
  );
}

function AIInner() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);

  const profileQ = useQuery({ queryKey: ['assistant', 'me'], queryFn: assistantApi.me });
  const convosQ = useQuery({ queryKey: ['assistant', 'conversations'], queryFn: assistantApi.listConversations });

  const create = useMutation({
    mutationFn: () => assistantApi.createConversation(),
    onSuccess: (c) => {
      setPicked(c.id);
      void qc.invalidateQueries({ queryKey: ['assistant', 'conversations'] });
    },
    onError: (e: Error) => Alert.alert('Could not start a chat', e.message),
  });

  // Land in the most recent conversation unless the user picked another —
  // derived from the list rather than seeded into state by an effect.
  const conversations = convosQ.data ?? [];
  const conversationId =
    (picked && conversations.some((c) => c.id === picked) ? picked : null) ??
    conversations[0]?.id ??
    null;
  const setConversationId = setPicked;

  // The one thing that genuinely is a side effect: a brand-new user has no
  // conversation at all, so open one. Not a setState, so no cascade.
  const needsFirstConversation = !!convosQ.data && conversations.length === 0;
  useEffect(() => {
    if (!needsFirstConversation || create.isPending || create.isSuccess) return;
    create.mutate();
    // Guarding on the mutation's own status is what prevents a loop here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsFirstConversation]);

  const threadQ = useQuery({
    queryKey: ['assistant', 'conversation', conversationId],
    queryFn: () => assistantApi.getConversation(conversationId!),
    enabled: !!conversationId,
  });

  const send = useMutation({
    mutationFn: (text: string) => assistantApi.sendMessage(conversationId!, text),
    onSuccess: () => {
      setDraft('');
      void qc.invalidateQueries({ queryKey: ['assistant', 'conversation', conversationId] });
      void qc.invalidateQueries({ queryKey: ['assistant', 'conversations'] });
    },
    onError: (e: Error) => Alert.alert('No reply', e.message),
  });

  const runAction = useMutation({
    mutationFn: ({ type, params }: SuggestedAction) => assistantApi.runAction(type, params),
    onSuccess: (res) => {
      Alert.alert('Done', res.summary);
      // An action can change anything — clients, messages, appointments.
      void qc.invalidateQueries();
    },
    onError: (e: Error) => Alert.alert('Action failed', e.message),
  });

  const profile = profileQ.data;
  const messages = threadQ.data?.messages ?? [];
  const inverted = [...messages].reverse();

  const mutatingTypes = new Set((profile?.actions ?? []).filter((a) => a.mutating).map((a) => a.type));

  const confirmAndRun = (action: SuggestedAction) => {
    if (!mutatingTypes.has(action.type)) {
      runAction.mutate(action);
      return;
    }
    Alert.alert('Run this action?', `${action.label}\n\nThis changes real data in your workspace.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Run', onPress: () => runAction.mutate(action) },
    ]);
  };

  return (
    <Screen edges={['top']}>
      <OwnerHeader
        title={profile?.name ?? 'Assistant'}
        subtitle={profile?.role}
        back
        actions={
          <>
            <IconButton
              icon="mic-outline"
              accessibilityLabel="Voice"
              onPress={() => router.push('/(owner)/more/voice')}
            />
            <IconButton icon="sunny-outline" accessibilityLabel="Morning brief" onPress={() => setBriefOpen(true)} />
            <IconButton icon="bookmark-outline" accessibilityLabel="Memory" onPress={() => setMemoryOpen(true)} />
            <IconButton icon="list-outline" accessibilityLabel="Conversations" onPress={() => setListOpen(true)} />
          </>
        }
      />

      {profileQ.isLoading ? (
        <Loading label="Waking the assistant" />
      ) : profileQ.isError ? (
        <View style={{ padding: spacing.lg }}>
          <QueryError
            error={profileQ.error}
            onRetry={() => void profileQ.refetch()}
            lockedFeature="AI Assistant"
          />
        </View>
      ) : (
        <KeyboardAvoider>
          {profile && !profile.aiConfigured ? (
            <View style={{ padding: spacing.lg }}>
              <Card style={{ gap: spacing.xs }}>
                <Pill label="Not configured" tone="warning" />
                <AppText variant="muted" tone="muted">
                  No AI provider key is set for this deployment, so replies fall back to canned text.
                </AppText>
              </Card>
            </View>
          ) : null}

          <FlatList
            data={inverted}
            inverted
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
            ListEmptyComponent={
              <View style={{ transform: [{ scaleY: -1 }] }}>
                {threadQ.isLoading ? (
                  <Loading />
                ) : (
                  <Greeting
                    greeting={profile?.greeting}
                    capabilities={profile?.capabilities ?? []}
                    onPick={(text) => setDraft(text)}
                  />
                )}
              </View>
            }
            renderItem={({ item }) => (
              <AssistantBubble message={item} onRunAction={confirmAndRun} running={runAction.isPending} />
            )}
          />

          <View style={[styles.composer, { borderTopColor: t.colors.border, backgroundColor: t.colors.canvas }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask about your practice"
              placeholderTextColor={t.colors.textFaint}
              multiline
              style={[
                styles.input,
                { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border },
              ]}
            />
            <Pressable
              disabled={!draft.trim() || send.isPending || !conversationId}
              onPress={() => send.mutate(draft.trim())}
              style={({ pressed }) => [
                styles.sendBtn,
                {
                  backgroundColor: t.colors.accent,
                  opacity: !draft.trim() || send.isPending ? 0.4 : pressed ? 0.8 : 1,
                },
              ]}>
              <AppText variant="caption" style={{ color: t.colors.onBrand }}>
                {send.isPending ? '…' : 'Ask'}
              </AppText>
            </Pressable>
          </View>
        </KeyboardAvoider>
      )}

      {/* Conversations */}
      <Sheet visible={listOpen} onClose={() => setListOpen(false)} title="Conversations">
        <ActionButton
          label="New conversation"
          icon="add"
          onPress={() => {
            create.mutate();
            setListOpen(false);
          }}
        />
        {!conversations.length ? (
          <EmptyState icon="chatbubbles-outline" title="No conversations yet" />
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {conversations.map((c) => (
              <ListRow
                key={c.id}
                title={c.title}
                subtitle={c.last_message_at ? relativeTime(c.last_message_at) : 'Empty'}
                icon="chatbubble-outline"
                tint={c.id === conversationId ? t.colors.accent : undefined}
                onPress={() => {
                  setConversationId(c.id);
                  setListOpen(false);
                }}
              />
            ))}
          </Card>
        )}
      </Sheet>

      <MemorySheet visible={memoryOpen} onClose={() => setMemoryOpen(false)} />
      <BriefSheet visible={briefOpen} onClose={() => setBriefOpen(false)} />
    </Screen>
  );
}

function Greeting({
  greeting,
  capabilities,
  onPick,
}: {
  greeting?: string;
  capabilities: string[];
  onPick: (text: string) => void;
}) {
  return (
    <View style={{ gap: spacing.md }}>
      <Card style={{ gap: spacing.sm }}>
        <Pill label="Assistant" tone="accent" />
        <AppText variant="body">{greeting ?? 'How can I help with your practice today?'}</AppText>
      </Card>
      {capabilities.length ? (
        <>
          <AppText variant="label" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
            Try asking
          </AppText>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {capabilities.slice(0, 6).map((c, i) => (
              <ListRow key={i} title={c} icon="sparkles-outline" onPress={() => onPick(c)} />
            ))}
          </Card>
        </>
      ) : null}
    </View>
  );
}

function AssistantBubble({
  message,
  onRunAction,
  running,
}: {
  message: AssistantMessage;
  onRunAction: (a: SuggestedAction) => void;
  running: boolean;
}) {
  const t = useTheme();
  const mine = message.role === 'user';

  if (message.role === 'system') {
    return (
      <AppText variant="caption" tone="faint" style={{ textAlign: 'center' }}>
        {message.content}
      </AppText>
    );
  }

  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '90%', gap: spacing.xs }}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: mine ? t.colors.accent : t.colors.surfaceStrong,
            borderBottomRightRadius: mine ? radius.sm : radius.lg,
            borderBottomLeftRadius: mine ? radius.lg : radius.sm,
          },
        ]}>
        <AppText variant="body" style={{ color: mine ? t.colors.onBrand : t.colors.text }}>
          {message.content}
        </AppText>
        <AppText
          variant="caption"
          style={{
            color: mine ? t.colors.onBrand : t.colors.textFaint,
            opacity: 0.7,
            fontSize: 10,
            alignSelf: 'flex-end',
          }}>
          {clockTime(message.created_at)}
        </AppText>
      </View>

      {!mine && message.actions?.length ? (
        <View style={{ gap: spacing.xs }}>
          {message.actions.map((a, i) => (
            <Pressable
              key={i}
              disabled={running}
              onPress={() => onRunAction(a)}
              style={({ pressed }) => [
                styles.actionChip,
                {
                  borderColor: t.colors.accent,
                  backgroundColor: pressed ? t.colors.surfaceStrong : 'transparent',
                  opacity: running ? 0.5 : 1,
                },
              ]}>
              <AppText variant="caption" tone="accent">
                ⚡ {a.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function BriefSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const briefQ = useQuery({
    queryKey: ['assistant', 'brief'],
    queryFn: assistantApi.brief,
    enabled: visible,
    staleTime: 30 * 60 * 1000,
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="Morning brief">
      {briefQ.isLoading ? (
        <Loading label="Reading your practice" />
      ) : briefQ.isError ? (
        <QueryError error={briefQ.error} onRetry={() => void briefQ.refetch()} lockedFeature="AI Assistant" />
      ) : briefQ.data ? (
        <>
          <AppText variant="title">{briefQ.data.headline}</AppText>
          <Card>
            <AppText variant="body">{briefQ.data.body}</AppText>
          </Card>
          {briefQ.data.source === 'fallback' ? (
            <AppText variant="caption" tone="faint">
              Generated from your numbers without AI — no provider key is configured.
            </AppText>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

function MemorySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const t = useTheme();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const memoryQ = useQuery({
    queryKey: ['assistant', 'memory'],
    queryFn: assistantApi.listMemory,
    enabled: visible,
  });

  const remember = useMutation({
    mutationFn: () => assistantApi.remember(key.trim(), value.trim()),
    onSuccess: () => {
      setKey('');
      setValue('');
      void qc.invalidateQueries({ queryKey: ['assistant', 'memory'] });
    },
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });

  const forget = useMutation({
    mutationFn: (id: string) => assistantApi.forget(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assistant', 'memory'] }),
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="What the assistant remembers">
      {memoryQ.isLoading ? (
        <Loading />
      ) : !memoryQ.data?.length ? (
        <EmptyState
          icon="bookmark-outline"
          title="Nothing remembered yet"
          body="Facts you save here are carried into every conversation."
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {memoryQ.data.map((m) => (
            <ListRow
              key={m.id}
              title={m.key}
              subtitle={m.value}
              icon="bookmark-outline"
              right={
                <AppText variant="caption" tone="danger" onPress={() => forget.mutate(m.id)}>
                  Forget
                </AppText>
              }
            />
          ))}
        </Card>
      )}

      <View style={{ gap: spacing.sm }}>
        <TextInput
          value={key}
          onChangeText={setKey}
          placeholder="What (e.g. clinic timings)"
          placeholderTextColor={t.colors.textFaint}
          style={[styles.input, { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border }]}
        />
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="Detail to remember"
          placeholderTextColor={t.colors.textFaint}
          multiline
          style={[
            styles.input,
            { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border, minHeight: 70 },
          ]}
        />
        <ActionButton
          label="Remember this"
          disabled={!key.trim() || !value.trim()}
          loading={remember.isPending}
          onPress={() => remember.mutate()}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bubble: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, gap: 3 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: font.size.base,
  },
  sendBtn: { paddingHorizontal: spacing.lg, paddingVertical: 11, borderRadius: radius.pill },
  actionChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
});
