import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Screen } from '@/components/ui';
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type ClientMessage } from '@/lib/clients-api';
import { brand, radius, spacing } from '@/lib/theme';

const TAB_BAR_HEIGHT = 56;
/**
 * The chat-media bucket's own ceiling.
 *
 * Was 1.4 MB, which existed only because the bytes travelled as a base64
 * data: URI inside the JSON request body. Attachments now go to storage, so
 * the limit is the bucket's.
 */
const MAX_ATTACH_BYTES = 25 * 1024 * 1024;

/** Soft brand tint — a low-alpha wash of a brand hue for chips, bubbles & tracks. */
function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);

/**
 * The high-water mark for an incremental poll: the newest change held.
 *
 * `updated_at`, not `created_at` — an old message edited a moment ago is the
 * real cursor, and a created_at cursor would stop delivering edits, reactions
 * and deletes forever. Undefined when any row lacks it (an older server),
 * which asks for the full thread and keeps working.
 */
function cursorOf(held?: ClientMessage[]): string | undefined {
  if (!held?.length) return undefined;
  let max: string | undefined;
  let sawServerRow = false;
  for (const m of held) {
    // An optimistic row has no server timestamp yet. Skip it rather than
    // abandoning the cursor, which would drop the thread back to full fetches
    // for as long as one send is in flight.
    if (m.id.startsWith('tmp_')) continue;
    // A real row with no updated_at means an older server: fall back to a full
    // fetch, which is correct if wasteful.
    if (!m.updated_at) return undefined;
    sawServerRow = true;
    if (!max || m.updated_at > max) max = m.updated_at;
  }
  return sawServerRow ? max : undefined;
}

/**
 * Apply a delta to the messages held: replace by id, add what is new.
 *
 * Order is left to the caller — this screen sorts newest-first for an inverted
 * list, so sorting here would fight it.
 */
function mergeMessages(held: ClientMessage[], delta: ClientMessage[]): ClientMessage[] {
  if (!delta.length) return held;
  const byId = new Map(held.map((m) => [m.id, m]));
  for (const m of delta) byId.set(m.id, m);
  // Drop any optimistic row the server has now confirmed, matched on content
  // and sender - otherwise a send that lands between two polls shows twice,
  // once as the placeholder and once as the saved row.
  const confirmed = new Set(
    delta.filter((m) => m.sender_type === 'client').map((m) => m.content),
  );
  for (const [key, m] of byId) {
    if (key.startsWith('tmp_') && m.sender_type === 'client' && confirmed.has(m.content)) {
      byId.delete(key);
    }
  }
  return [...byId.values()];
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Upload one attachment to storage and return its key.
 *
 * Replaces reading the file into a base64 data: URI and posting it in the
 * message body. That inlined copy was stored on the message row and then
 * re-sent to every reader on every poll - a single photo turned the thread
 * into roughly a megabyte of repeat traffic, which on a client's phone is
 * their own data allowance.
 *
 * A blob PUT is used rather than FileSystem.uploadAsync: it is what the file
 * and verification uploads already do here, and only *multipart* is broken on
 * this Expo version (see uploadAvatar).
 */
async function uploadChatMedia(
  uri: string,
  mime: string,
  name: string,
): Promise<{ storageKey: string; size: number }> {
  const blob = await (await fetch(uri)).blob();
  if (blob.size > MAX_ATTACH_BYTES) {
    throw new Error('Attachment must be under 25 MB. Try a smaller file.');
  }
  const ticket = await clientsApi.chatMediaTicket(name);
  const put = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    // Storage keeps whatever type it is told, and serves it back on download -
    // without this an image arrives as a generic blob and the phone offers to
    // save it instead of showing it inline.
    headers: { 'Content-Type': mime || 'application/octet-stream' },
    body: blob,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return { storageKey: ticket.storageKey, size: blob.size };
}

export default function Chat() {
  const t = useTheme();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const tabH = TAB_BAR_HEIGHT + insets.bottom;
  const kbVisible = useKeyboardVisible();
  const [text, setText] = useState('');
  const [attachBusy, setAttachBusy] = useState(false);
  const inputRef = useRef<TextInput>(null);

  /**
   * My thread, polled incrementally.
   *
   * It re-downloaded all 80 messages every 5 seconds to find out nothing had
   * changed. On a client's phone that is their own data allowance, so the poll
   * now sends the newest `updated_at` held and gets back only what changed.
   */
  const msgsQ = useQuery({
    queryKey: ['me', 'messages'],
    queryFn: async () => {
      const held = qc.getQueryData<ClientMessage[]>(['me', 'messages']);
      const since = cursorOf(held);
      const delta = await clientsApi.myMessages(80, since);
      // Without a cursor the response IS the thread; with one it is a patch,
      // and treating a patch as the whole thread would blank the chat on the
      // first quiet poll.
      return since ? mergeMessages(held ?? [], delta) : delta;
    },
    refetchInterval: 5000,
    retry: 1,
  });
  const nutriQ = useQuery({
    queryKey: ['me', 'nutritionist'],
    queryFn: () => clientsApi.myNutritionist(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  /**
   * Sending, applied to the screen immediately.
   *
   * This used to wait for the server and then refetch, so a tapped message sat
   * in the input box until the round trip finished and only then appeared.
   * That pause - not list rendering, which FlatList already handles - is what
   * made the chat feel slow. The message now shows at once and the saved row
   * replaces it, or it rolls back and the text comes back on failure.
   */
  const sendMut = useMutation({
    mutationFn: clientsApi.sendMessage,
    onMutate: (vars: {
      content?: string;
      attachment?: { url?: string; storageKey?: string; type: string; name?: string; size?: number };
    }) => {
      const prev = qc.getQueryData<ClientMessage[]>(['me', 'messages']);
      const att = vars.attachment;
      const tmpId = `tmp_${Math.random().toString(36).slice(2)}`;
      const tmp: ClientMessage = {
        id: tmpId,
        sender_type: 'client',
        message_type: att
          ? (att.type.startsWith('image/') ? 'image' : att.type.startsWith('audio/') ? 'voice' : 'file')
          : 'manual',
        content: vars.content ?? '',
        is_read: false,
        created_at: new Date().toISOString(),
        attachment_name: att?.name ?? null,
        attachment_type: att?.type ?? null,
        attachment_size: att?.size ?? null,
        // No preview URL for a storage upload - the signed URL only exists
        // once the server has saved the row, so an attachment bubble shows its
        // name until then rather than a broken image.
        attachment_url: att?.url ?? null,
      };
      qc.setQueryData<ClientMessage[]>(['me', 'messages'], (old) => [...(old ?? []), tmp]);
      return { prev, tmpId };
    },
    onSuccess: (row, _vars, ctx) => {
      // Swap the placeholder for the saved row rather than refetching, so the
      // bubble never flickers out and back in.
      if (ctx?.tmpId && row) {
        qc.setQueryData<ClientMessage[]>(['me', 'messages'], (old) =>
          (old ?? []).map((m) => (m.id === ctx.tmpId ? row : m)));
      }
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['me', 'messages'], ctx.prev);
      Alert.alert('Could not send', err.message);
    },
  });

  useEffect(() => {
    clientsApi.markMyMessagesRead().catch(() => {});
  }, []);

  const data = useMemo(
    () => [...(msgsQ.data ?? [])].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [msgsQ.data],
  );

  const onSend = () => {
    const content = text.trim();
    if (!content) return;
    // Deliberately not blocked on sendMut.isPending any more: each send is now
    // its own optimistic bubble, so firing two quickly shows two messages
    // instead of silently swallowing the second.
    setText('');
    sendMut.mutate({ content });
  };

  const sendAttachment = async (uri: string, mime: string, name: string) => {
    setAttachBusy(true);
    try {
      const { storageKey, size } = await uploadChatMedia(uri, mime, name);
      await sendMut.mutateAsync({
        content: text.trim() || undefined,
        attachment: { storageKey, type: mime, name, size },
      });
      setText('');
    } catch (e) {
      Alert.alert('Could not attach', (e as Error).message);
    } finally {
      setAttachBusy(false);
    }
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      mediaTypes: 'images',
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    await sendAttachment(a.uri, a.mimeType ?? 'image/jpeg', a.fileName ?? `photo-${Date.now()}.jpg`);
  };

  const pickFile = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets?.[0]) return;
    const a = picked.assets[0];
    await sendAttachment(a.uri, a.mimeType ?? 'application/octet-stream', a.name || `file-${Date.now()}`);
  };

  const onAttach = () =>
    Alert.alert('Attach', undefined, [
      { text: 'Photo', onPress: () => void pickImage() },
      { text: 'File', onPress: () => void pickFile() },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const nutriName = nutriQ.data?.name ?? 'Your nutritionist';
  const busy = sendMut.isPending || attachBusy;
  const canSend = !!text.trim() && !busy;

  return (
    <Screen edges={['top']}>
      <View style={[styles.header, { borderBottomColor: t.colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: tint(brand.teal, t.dark ? 0.22 : 0.12) }]}>
          <Ionicons name="leaf" size={20} color={t.colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{nutriName}</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[styles.dot, { backgroundColor: t.colors.success }]} />
            <AppText variant="caption" tone="muted">
              {nutriQ.data?.tagline ?? 'Wellness coach'}
            </AppText>
          </View>
        </View>
      </View>

      {/* keyboardVerticalOffset stays 0: RN ADDS it to the padding it computes,
          so passing tabH here while the composer also pads by tabH left the
          input floating two tab-bars above the keys. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        {msgsQ.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : data.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyChip, { backgroundColor: tint(brand.teal, t.dark ? 0.2 : 0.12) }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={28} color={t.colors.primary} />
            </View>
            <AppText variant="muted" tone="muted" style={{ textAlign: 'center', maxWidth: 260 }}>
              No messages yet. Say hello to {nutriName.split(' ')[0]}.
            </AppText>
          </View>
        ) : (
          <FlatList
            data={data}
            inverted
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
            renderItem={({ item, index }) => {
              // Inverted list: index+1 is the chronologically older message.
              // Show a date chip above the oldest message of each day.
              const older = data[index + 1];
              const showDate = !older || dayKey(older.created_at) !== dayKey(item.created_at);
              return (
                <>
                  <Bubble msg={item} />
                  {showDate ? <DateSeparator iso={item.created_at} /> : null}
                </>
              );
            }}
          />
        )}

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
          <Pressable onPress={onAttach} disabled={busy} style={styles.attachBtn} hitSlop={8}>
            {attachBusy ? (
              <ActivityIndicator size="small" color={t.colors.accent} />
            ) : (
              <Ionicons name="add-circle-outline" size={26} color={t.colors.accent} />
            )}
          </Pressable>
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
          <Pressable onPress={onSend} disabled={!canSend} hitSlop={6}>
            {canSend ? (
              <LinearGradient
                colors={t.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendBtn}>
                {sendMut.isPending && !attachBusy ? (
                  <ActivityIndicator size="small" color={t.colors.onBrand} />
                ) : (
                  <Ionicons name="arrow-up" size={20} color={t.colors.onBrand} />
                )}
              </LinearGradient>
            ) : (
              <View style={[styles.sendBtn, { backgroundColor: t.colors.surfaceStrong }]}>
                <Ionicons name="arrow-up" size={20} color={t.colors.textFaint} />
              </View>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function DateSeparator({ iso }: { iso: string }) {
  const t = useTheme();
  return (
    <View style={styles.dateRow}>
      <View style={[styles.datePill, { backgroundColor: t.colors.surfaceStrong }]}>
        <AppText variant="caption" tone="faint" style={{ letterSpacing: 0.4 }}>
          {formatDayLabel(iso)}
        </AppText>
      </View>
    </View>
  );
}

function Bubble({ msg }: { msg: ClientMessage }) {
  const t = useTheme();
  const mine = msg.sender_type === 'client';
  const system = msg.sender_type === 'system';
  const isImage =
    msg.message_type === 'image' ||
    (msg.attachment_type?.startsWith('image/') ?? false) ||
    (msg.attachment_url?.startsWith('data:image/') ?? false);
  const hasAttach = !!msg.attachment_url;

  const otherBg = t.dark ? t.colors.surfaceStrong : t.colors.surface;

  const inner = (
    <>
      {system ? (
        <AppText variant="caption" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
          System
        </AppText>
      ) : null}

      {hasAttach && isImage ? (
        <Pressable onPress={() => msg.attachment_url && void Linking.openURL(msg.attachment_url)}>
          <Image
            source={{ uri: msg.attachment_url! }}
            style={{ width: 200, height: 160, borderRadius: radius.lg }}
            contentFit="cover"
          />
        </Pressable>
      ) : null}

      {hasAttach && !isImage ? (
        <Pressable
          onPress={() => msg.attachment_url && void Linking.openURL(msg.attachment_url)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="document-outline" size={16} color={mine ? t.colors.onBrand : t.colors.accent} />
          <AppText variant="caption" tone={mine ? 'onBrand' : 'accent'} numberOfLines={1}>
            {msg.attachment_name ?? 'Attachment'}
          </AppText>
        </Pressable>
      ) : null}

      {msg.content ? (
        <AppText variant="body" tone={mine ? 'onBrand' : 'text'}>
          {msg.content}
        </AppText>
      ) : null}

      <AppText
        variant="caption"
        tone={mine ? 'onBrand' : 'faint'}
        style={{ alignSelf: 'flex-end', marginTop: 2, opacity: mine ? 0.85 : 1 }}>
        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </AppText>
    </>
  );

  if (mine) {
    return (
      <LinearGradient
        colors={t.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.bubble, styles.bubbleMine]}>
        {inner}
      </LinearGradient>
    );
  }

  return (
    <View
      style={[
        styles.bubble,
        styles.bubbleOther,
        { backgroundColor: otherBg, borderColor: t.colors.border },
      ]}>
      {inner}
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
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  emptyChip: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateRow: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  datePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.xl,
    gap: 6,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: radius.sm,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: radius.sm,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachBtn: {
    width: 40,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
