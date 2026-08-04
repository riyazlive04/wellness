/**
 * Team chat — ports the web Collaborate page (Module 9).
 *
 * Internal channels and shared notes. Clients never see any of this; it's the
 * back room. Channel messages poll every 12s while the tab is open.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';

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
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { collaborationApi } from '@/lib/owner/api/collaboration';
import { clockTime, initials, relativeTime, titleCase } from '@/lib/owner/format';
import { font, radius, spacing } from '@/lib/theme';

type Tab = 'channels' | 'notes';

export default function OwnerCollaborate() {
  return (
    <RouteGate permission="collaborate.use">
      <CollaborateInner />
    </RouteGate>
  );
}

function CollaborateInner() {
  const [tab, setTab] = useState<Tab>('channels');

  return (
    <OwnerPage title="Team chat" subtitle="Channels and shared notes" back contentStyle={{ paddingHorizontal: 0 }}>
      <SegmentedTabs
        options={[
          { key: 'channels', label: 'Channels' },
          { key: 'notes', label: 'Shared notes' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        {tab === 'channels' ? <ChannelsPanel /> : <NotesPanel />}
      </View>
    </OwnerPage>
  );
}

function ChannelsPanel() {
  const t = useTheme();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const channelsQ = useQuery({ queryKey: ['collaboration', 'channels'], queryFn: collaborationApi.listChannels });

  // Default into the general channel (or the first one) until the user picks
  // one — derived rather than seeded through an effect.
  const channels = channelsQ.data ?? [];
  const channelId =
    (picked && channels.some((c) => c.id === picked) ? picked : null) ??
    (channels.find((c) => c.is_general) ?? channels[0])?.id ??
    null;
  const setChannelId = setPicked;

  const messagesQ = useQuery({
    queryKey: ['collaboration', 'messages', channelId],
    queryFn: () => collaborationApi.listMessages(channelId!),
    enabled: !!channelId,
    refetchInterval: 12_000,
  });

  const send = useMutation({
    mutationFn: (content: string) => collaborationApi.sendMessage(channelId!, content),
    onSuccess: () => {
      setDraft('');
      void qc.invalidateQueries({ queryKey: ['collaboration', 'messages', channelId] });
    },
    onError: (e: Error) => Alert.alert('Not sent', e.message),
  });

  const create = useMutation({
    mutationFn: () => collaborationApi.createChannel(name.trim(), description.trim() || undefined),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ['collaboration', 'channels'] });
      setName('');
      setDescription('');
      setNewOpen(false);
      setChannelId(c.id);
    },
    onError: (e: Error) => Alert.alert('Could not create', e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => collaborationApi.deleteChannel(id),
    onSuccess: () => {
      setChannelId(null);
      void qc.invalidateQueries({ queryKey: ['collaboration'] });
    },
    onError: (e: Error) => Alert.alert('Could not delete', e.message),
  });

  const active = channelsQ.data?.find((c) => c.id === channelId);

  return (
    <>
      {channelsQ.isLoading ? (
        <Loading />
      ) : channelsQ.isError ? (
        <QueryError error={channelsQ.error} onRetry={() => void channelsQ.refetch()} />
      ) : (
        <>
          <SegmentedTabs
            options={channels.map((c) => ({
              key: c.id,
              label: `#${c.name}`,
              badge: c.message_count,
            }))}
            value={channelId ?? ''}
            onChange={setChannelId}
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <ActionButton label="New channel" icon="add" tone="neutral" onPress={() => setNewOpen(true)} />
            </View>
            {active && !active.is_general ? (
              <IconButton
                icon="trash-outline"
                tone="danger"
                accessibilityLabel="Delete channel"
                onPress={() =>
                  Alert.alert('Delete channel?', `#${active.name} and its messages go away.`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(active.id) },
                  ])
                }
              />
            ) : null}
          </View>
        </>
      )}

      {active?.description ? (
        <AppText variant="caption" tone="faint">
          {active.description}
        </AppText>
      ) : null}

      {messagesQ.isLoading ? (
        <Loading />
      ) : !messagesQ.data?.length ? (
        <EmptyState icon="chatbubbles-outline" title="No messages" body="Start the thread." />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {messagesQ.data.map((m) => (
            <Card key={m.id} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <AppText variant="caption" tone="accent" style={{ flex: 1 }} numberOfLines={1}>
                  {m.sender_email ?? 'Team'}
                  {m.sender_role ? ` · ${titleCase(m.sender_role)}` : ''}
                </AppText>
                <AppText variant="caption" tone="faint">
                  {clockTime(m.created_at)}
                </AppText>
              </View>
              <AppText variant="body">{m.content}</AppText>
            </Card>
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={active ? `Message #${active.name}` : 'Message'}
          placeholderTextColor={t.colors.textFaint}
          multiline
          style={{
            flex: 1,
            maxHeight: 110,
            backgroundColor: t.colors.surfaceStrong,
            borderColor: t.colors.border,
            borderWidth: 1,
            borderRadius: radius.lg,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            color: t.colors.text,
            fontSize: font.size.base,
          }}
        />
        <View style={{ width: 92 }}>
          <ActionButton
            label="Send"
            disabled={!draft.trim() || !channelId}
            loading={send.isPending}
            onPress={() => send.mutate(draft.trim())}
          />
        </View>
      </View>

      <Sheet visible={newOpen} onClose={() => setNewOpen(false)} title="New channel">
        <Field label="Name" value={name} onChangeText={setName} placeholder="clinical-questions" autoCapitalize="none" />
        <Field
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          multiline
          style={{ minHeight: 64, textAlignVertical: 'top' }}
        />
        <ActionButton
          label="Create channel"
          disabled={!name.trim()}
          loading={create.isPending}
          onPress={() => create.mutate()}
        />
      </Sheet>
    </>
  );
}

function NotesPanel() {
  const t = useTheme();
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const notesQ = useQuery({ queryKey: ['collaboration', 'notes'], queryFn: collaborationApi.listNotes });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['collaboration', 'notes'] });

  const create = useMutation({
    mutationFn: () => collaborationApi.createNote(body.trim(), title.trim() || undefined),
    onSuccess: () => {
      setTitle('');
      setBody('');
      setNewOpen(false);
      refresh();
    },
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });

  const pin = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      collaborationApi.updateNote(id, { pinned }),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => collaborationApi.deleteNote(id),
    onSuccess: refresh,
  });

  const notes = [...(notesQ.data ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned));

  return (
    <>
      <ActionButton label="New note" icon="add" onPress={() => setNewOpen(true)} />

      {notesQ.isLoading ? (
        <Loading />
      ) : notesQ.isError ? (
        <QueryError error={notesQ.error} onRetry={() => void notesQ.refetch()} />
      ) : !notes.length ? (
        <EmptyState
          icon="document-text-outline"
          title="No shared notes"
          body="Protocols, scripts, anything the whole team should be able to look up."
        />
      ) : (
        notes.map((n) => (
          <Card key={n.id} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AppText variant="heading" style={{ flex: 1 }}>
                {n.title || 'Untitled'}
              </AppText>
              {n.pinned ? <Pill label="Pinned" tone="accent" /> : null}
            </View>
            <AppText variant="body">{n.body}</AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <AppText variant="caption" tone="faint" style={{ flex: 1 }}>
                {`${n.author_email ?? 'Team'} · ${relativeTime(n.updated_at)}`}
              </AppText>
              <AppText
                variant="caption"
                tone="muted"
                onPress={() => pin.mutate({ id: n.id, pinned: !n.pinned })}>
                {n.pinned ? 'Unpin' : 'Pin'}
              </AppText>
              <AppText
                variant="caption"
                tone="danger"
                onPress={() =>
                  Alert.alert('Delete note?', n.title || 'This note', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(n.id) },
                  ])
                }>
                Delete
              </AppText>
            </View>
          </Card>
        ))
      )}

      <Sheet visible={newOpen} onClose={() => setNewOpen(false)} title="New shared note">
        <Field label="Title (optional)" value={title} onChangeText={setTitle} />
        <Field
          label="Note"
          value={body}
          onChangeText={setBody}
          multiline
          style={{ minHeight: 150, textAlignVertical: 'top' }}
        />
        <ActionButton
          label="Save note"
          disabled={!body.trim()}
          loading={create.isPending}
          onPress={() => create.mutate()}
        />
      </Sheet>
    </>
  );
}
