/**
 * Client thread — the nutritionist's side of a conversation.
 *
 * Ports the thread pane of the web Messaging page: send, reply, react, edit,
 * delete, pin, quick replies and scheduled sends, plus the AI conversation
 * summary. Marks the thread read on open, and polls every 8s while it's on
 * screen so a reply from the client lands without a pull-to-refresh.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  ActionButton,
  EmptyState,
  IconButton,
  ListRow,
  Loading,
  OwnerHeader,
  Sheet,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card, KeyboardAvoider, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { ownerClientsApi, type ThreadMessage } from '@/lib/owner/api/clients';
import { collaborationApi } from '@/lib/owner/api/collaboration';
import { clockTime, dayLabel } from '@/lib/owner/format';
import { font, radius, spacing } from '@/lib/theme';

const REACTIONS = ['👍', '❤️', '🎉', '💪', '🙏'];

export default function OwnerThread() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const id = String(clientId);
  const router = useRouter();
  const t = useTheme();
  const qc = useQueryClient();

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const [actionOn, setActionOn] = useState<ThreadMessage | null>(null);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const listRef = useRef<FlatList<ThreadMessage>>(null);

  const threadQ = useQuery({
    queryKey: ['messaging', 'thread', id],
    queryFn: () => ownerClientsApi.clientThread(id),
    refetchInterval: 8_000,
    enabled: !!id,
  });

  const convoQ = useQuery({
    queryKey: ['messaging', 'conversations'],
    queryFn: ownerClientsApi.listConversations,
  });
  const clientName = convoQ.data?.find((c) => c.client_id === id)?.client_name ?? 'Client';

  // Mark read on open, and again whenever new inbound messages arrive.
  const unreadCount = (threadQ.data ?? []).filter((m) => m.sender_type === 'client' && !m.is_read).length;
  useEffect(() => {
    if (!id || !unreadCount) return;
    void ownerClientsApi.markClientThreadRead(id).then(() => {
      void qc.invalidateQueries({ queryKey: ['messaging', 'conversations'] });
      void qc.invalidateQueries({ queryKey: ['owner', 'sidebar-badges'] });
    });
  }, [id, unreadCount, qc]);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['messaging', 'thread', id] });
    void qc.invalidateQueries({ queryKey: ['messaging', 'conversations'] });
  }, [qc, id]);

  const send = useMutation({
    mutationFn: (text: string) =>
      ownerClientsApi.sendToClient(id, { content: text, replyTo: replyTo?.id }),
    onSuccess: () => {
      setDraft('');
      setReplyTo(null);
      refresh();
    },
    onError: (e: Error) => Alert.alert('Message not sent', e.message),
  });

  const react = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      ownerClientsApi.reactToClientMsg(id, messageId, emoji),
    onSuccess: refresh,
  });
  const pin = useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: string; pinned: boolean }) =>
      ownerClientsApi.pinClientMsg(id, messageId, pinned),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (messageId: string) => ownerClientsApi.deleteClientMsg(id, messageId),
    onSuccess: refresh,
  });
  const edit = useMutation({
    mutationFn: ({ messageId, content }: { messageId: string; content: string }) =>
      ownerClientsApi.editClientMsg(id, messageId, content),
    onSuccess: refresh,
  });

  const messages = threadQ.data ?? [];
  // The API returns oldest-first; an inverted list renders newest at the bottom
  // while keeping scroll anchored there as new messages arrive.
  const inverted = [...messages].reverse();

  return (
    <Screen edges={['top']}>
      <OwnerHeader
        title={clientName}
        subtitle={threadQ.isFetching ? 'Syncing…' : `${messages.length} messages`}
        back
        actions={
          <>
            <IconButton
              icon="sparkles-outline"
              accessibilityLabel="AI summary"
              onPress={() => setSummaryOpen(true)}
            />
            <IconButton
              icon="person-outline"
              accessibilityLabel="Open client"
              onPress={() => router.push(`/(owner)/clients/${id}`)}
            />
          </>
        }
      />

      <KeyboardAvoider offset={0}>
        {threadQ.isLoading ? (
          <Loading label="Loading conversation" />
        ) : threadQ.isError ? (
          <View style={{ padding: spacing.lg }}>
            <QueryError error={threadQ.error} onRetry={() => void threadQ.refetch()} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={inverted}
            inverted
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
            ListEmptyComponent={
              <View style={{ transform: [{ scaleY: -1 }] }}>
                <EmptyState
                  icon="chatbubble-ellipses-outline"
                  title="No messages yet"
                  body={`Say hello to ${clientName.split(' ')[0]} — a first nudge lifts logging more than anything else.`}
                />
              </View>
            }
            renderItem={({ item, index }) => {
              const prev = inverted[index + 1];
              const showDay = !prev || dayLabel(prev.created_at) !== dayLabel(item.created_at);
              return (
                <>
                  <Bubble
                    message={item}
                    onLongPress={() => setActionOn(item)}
                    onReply={() => setReplyTo(item)}
                  />
                  {showDay ? (
                    <AppText
                      variant="caption"
                      tone="faint"
                      style={{ textAlign: 'center', marginVertical: spacing.sm }}>
                      {dayLabel(item.created_at)}
                    </AppText>
                  ) : null}
                </>
              );
            }}
          />
        )}

        {/* Reply preview */}
        {replyTo ? (
          <View
            style={[
              styles.replyBar,
              { backgroundColor: t.colors.surfaceStrong, borderTopColor: t.colors.border },
            ]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="label" tone="accent">
                Replying to {replyTo.sender_type === 'admin' ? 'yourself' : clientName.split(' ')[0]}
              </AppText>
              <AppText variant="caption" tone="muted" numberOfLines={1}>
                {replyTo.content}
              </AppText>
            </View>
            <IconButton icon="close" onPress={() => setReplyTo(null)} accessibilityLabel="Cancel reply" />
          </View>
        ) : null}

        {/* Composer */}
        <View style={[styles.composer, { borderTopColor: t.colors.border, backgroundColor: t.colors.canvas }]}>
          <IconButton icon="flash-outline" onPress={() => setQuickOpen(true)} accessibilityLabel="Quick replies" />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a message"
            placeholderTextColor={t.colors.textFaint}
            multiline
            style={[
              styles.input,
              { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border },
            ]}
          />
          <Pressable
            disabled={!draft.trim() || send.isPending}
            onPress={() => send.mutate(draft.trim())}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                backgroundColor: t.colors.accent,
                opacity: !draft.trim() || send.isPending ? 0.4 : pressed ? 0.8 : 1,
              },
            ]}>
            <AppText variant="caption" style={{ color: t.colors.onBrand }}>
              Send
            </AppText>
          </Pressable>
        </View>
      </KeyboardAvoider>

      {/* Message actions */}
      <Sheet visible={!!actionOn} onClose={() => setActionOn(null)} title="Message">
        <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}>
          {REACTIONS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => {
                if (actionOn) react.mutate({ messageId: actionOn.id, emoji });
                setActionOn(null);
              }}
              style={[styles.reaction, { backgroundColor: t.colors.surfaceStrong }]}>
              <AppText variant="heading">{emoji}</AppText>
            </Pressable>
          ))}
        </View>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ListRow
            title="Reply"
            icon="arrow-undo-outline"
            onPress={() => {
              setReplyTo(actionOn);
              setActionOn(null);
            }}
          />
          <ListRow
            title={actionOn?.metadata?.pinned_at ? 'Unpin' : 'Pin to top'}
            icon="pin-outline"
            onPress={() => {
              if (actionOn) pin.mutate({ messageId: actionOn.id, pinned: !actionOn.metadata?.pinned_at });
              setActionOn(null);
            }}
          />
          {actionOn?.sender_type === 'admin' ? (
            <>
              <ListRow
                title="Edit"
                icon="create-outline"
                onPress={() => {
                  // Alert.prompt is iOS-only, so editing gets a real sheet
                  // rather than a no-op on Android.
                  setEditing({ id: actionOn.id, content: actionOn.content });
                  setActionOn(null);
                }}
              />
              <ListRow
                title="Delete"
                icon="trash-outline"
                danger
                onPress={() => {
                  const msg = actionOn;
                  setActionOn(null);
                  Alert.alert('Delete message?', 'It disappears for both of you.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(msg.id) },
                  ]);
                }}
              />
            </>
          ) : null}
        </Card>
      </Sheet>

      <QuickRepliesSheet
        visible={quickOpen}
        onClose={() => setQuickOpen(false)}
        onPick={(body) => {
          setDraft((d) => (d ? `${d} ${body}` : body));
          setQuickOpen(false);
        }}
      />

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title="Edit message">
        <TextInput
          value={editing?.content ?? ''}
          onChangeText={(v) => setEditing((e) => (e ? { ...e, content: v } : e))}
          multiline
          placeholderTextColor={t.colors.textFaint}
          style={[
            styles.input,
            {
              backgroundColor: t.colors.surfaceStrong,
              color: t.colors.text,
              borderColor: t.colors.border,
              minHeight: 110,
              textAlignVertical: 'top',
            },
          ]}
        />
        <ActionButton
          label="Save"
          loading={edit.isPending}
          disabled={!editing?.content.trim()}
          onPress={() => {
            if (!editing) return;
            edit.mutate({ messageId: editing.id, content: editing.content.trim() });
            setEditing(null);
          }}
        />
      </Sheet>

      <SummarySheet
        clientId={id}
        visible={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        onUseReply={(text) => {
          setDraft((d) => (d ? `${d} ${text}` : text));
          setSummaryOpen(false);
        }}
      />
    </Screen>
  );
}

function Bubble({
  message,
  onLongPress,
  onReply,
}: {
  message: ThreadMessage;
  onLongPress: () => void;
  onReply: () => void;
}) {
  const t = useTheme();
  const mine = message.sender_type === 'admin';
  const system = message.sender_type === 'system';
  const deleted = !!message.metadata?.deleted_at;
  const reactions = Object.values(message.metadata?.reactions ?? {}).filter(Boolean);

  if (system) {
    return (
      <AppText variant="caption" tone="faint" style={{ textAlign: 'center' }}>
        {message.content}
      </AppText>
    );
  }

  return (
    <Pressable
      onLongPress={onLongPress}
      onPress={onReply}
      style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: mine ? t.colors.accent : t.colors.surfaceStrong,
            borderBottomRightRadius: mine ? radius.sm : radius.lg,
            borderBottomLeftRadius: mine ? radius.lg : radius.sm,
          },
        ]}>
        {message.metadata?.reply ? (
          <View style={[styles.quoted, { borderLeftColor: mine ? t.colors.onBrand : t.colors.accent }]}>
            <AppText variant="caption" style={{ color: mine ? t.colors.onBrand : t.colors.textMuted }} numberOfLines={1}>
              {message.metadata.reply.preview}
            </AppText>
          </View>
        ) : null}

        <AppText
          variant="body"
          style={{
            color: mine ? t.colors.onBrand : t.colors.text,
            fontStyle: deleted ? 'italic' : 'normal',
            opacity: deleted ? 0.6 : 1,
          }}>
          {deleted ? 'This message was deleted' : message.content}
        </AppText>

        {message.attachment_url ? (
          <AppText variant="caption" style={{ color: mine ? t.colors.onBrand : t.colors.accent }}>
            📎 {message.attachment_name ?? 'Attachment'}
          </AppText>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-end' }}>
          {message.metadata?.edited_at ? (
            <AppText variant="caption" style={{ color: mine ? t.colors.onBrand : t.colors.textFaint, opacity: 0.7 }}>
              edited
            </AppText>
          ) : null}
          <AppText
            variant="caption"
            style={{ color: mine ? t.colors.onBrand : t.colors.textFaint, opacity: 0.75, fontSize: 10 }}>
            {clockTime(message.created_at)}
          </AppText>
        </View>
      </View>

      {reactions.length ? (
        <View style={{ flexDirection: 'row', gap: 2, alignSelf: mine ? 'flex-end' : 'flex-start', marginTop: -6 }}>
          {reactions.map((r, i) => (
            <View key={i} style={[styles.reactionChip, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
              <AppText variant="caption">{r}</AppText>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

function QuickRepliesSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (body: string) => void;
}) {
  const qc = useQueryClient();
  const [newBody, setNewBody] = useState('');

  const listQ = useQuery({
    queryKey: ['messaging', 'quick-replies'],
    queryFn: ownerClientsApi.listQuickReplies,
    enabled: visible,
  });
  const create = useMutation({
    mutationFn: (body: string) => ownerClientsApi.createQuickReply(body),
    onSuccess: () => {
      setNewBody('');
      void qc.invalidateQueries({ queryKey: ['messaging', 'quick-replies'] });
    },
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => ownerClientsApi.deleteQuickReply(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['messaging', 'quick-replies'] }),
  });

  const t = useTheme();

  return (
    <Sheet visible={visible} onClose={onClose} title="Quick replies">
      {listQ.isLoading ? (
        <Loading />
      ) : !listQ.data?.length ? (
        <EmptyState
          icon="flash-outline"
          title="No saved replies"
          body="Save the things you type over and over — check-in nudges, portion reminders."
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {listQ.data.map((q) => (
            <ListRow
              key={q.id}
              title={q.label || q.body}
              subtitle={q.label ? q.body : undefined}
              icon="flash-outline"
              onPress={() => onPick(q.body)}
              right={
                <AppText variant="caption" tone="danger" onPress={() => remove.mutate(q.id)}>
                  Delete
                </AppText>
              }
            />
          ))}
        </Card>
      )}

      <TextInput
        value={newBody}
        onChangeText={setNewBody}
        placeholder="New quick reply"
        placeholderTextColor={t.colors.textFaint}
        multiline
        style={[
          styles.input,
          { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border, minHeight: 70 },
        ]}
      />
      <ActionButton
        label="Save reply"
        icon="add"
        disabled={!newBody.trim()}
        loading={create.isPending}
        onPress={() => create.mutate(newBody.trim())}
      />
    </Sheet>
  );
}

/**
 * AI assist — conversation summary and suggested replies, the same two
 * collaboration endpoints the web thread header calls. Tapping a suggestion
 * drops it into the composer rather than sending it: the nutritionist stays
 * the author.
 */
function SummarySheet({
  clientId,
  visible,
  onClose,
  onUseReply,
}: {
  clientId: string;
  visible: boolean;
  onClose: () => void;
  onUseReply: (text: string) => void;
}) {
  const summaryQ = useQuery({
    queryKey: ['collaboration', 'summary', clientId],
    queryFn: () => collaborationApi.summary(clientId),
    enabled: visible,
    staleTime: 10 * 60 * 1000,
  });
  const repliesQ = useQuery({
    queryKey: ['collaboration', 'smart-replies', clientId],
    queryFn: () => collaborationApi.smartReplies(clientId),
    enabled: visible,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="AI assist">
      <AppText variant="label" tone="muted">
        CONVERSATION SUMMARY
      </AppText>
      {summaryQ.isLoading ? (
        <Loading label="Reading the thread" />
      ) : summaryQ.isError ? (
        <QueryError
          error={summaryQ.error}
          onRetry={() => void summaryQ.refetch()}
          lockedFeature="AI assist"
        />
      ) : (
        <Card>
          <AppText variant="body">{summaryQ.data?.summary || 'Nothing to summarise yet.'}</AppText>
        </Card>
      )}

      <AppText variant="label" tone="muted" style={{ marginTop: spacing.md }}>
        SUGGESTED REPLIES
      </AppText>
      {repliesQ.isLoading ? (
        <Loading />
      ) : !repliesQ.data?.replies.length ? (
        <AppText variant="muted" tone="faint">
          No suggestions right now.
        </AppText>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {repliesQ.data.replies.map((r, i) => (
            <ListRow key={i} title={r} icon="sparkles-outline" onPress={() => onUseReply(r)} />
          ))}
        </Card>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    gap: 3,
  },
  quoted: {
    borderLeftWidth: 3,
    paddingLeft: spacing.sm,
    marginBottom: 2,
    opacity: 0.8,
  },
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
  sendBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    borderRadius: radius.pill,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reaction: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
