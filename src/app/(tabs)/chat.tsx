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
const MAX_ATTACH_BYTES = 1.4 * 1024 * 1024;

/** Soft brand tint — a low-alpha wash of a brand hue for chips, bubbles & tracks. */
function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);

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

async function uriToDataUrl(uri: string, mime: string): Promise<{ url: string; size: number }> {
  const res = await fetch(uri);
  const blob = await res.blob();
  if (blob.size > MAX_ATTACH_BYTES) {
    throw new Error('Attachment must be under ~1.4 MB. Try a smaller image or file.');
  }
  const reader = new FileReader();
  const url = await new Promise<string>((resolve, reject) => {
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
  // Ensure MIME prefix matches (some RN blobs omit type).
  const fixed =
    url.startsWith('data:') && !url.startsWith(`data:${mime}`)
      ? `data:${mime};base64,${url.split(',')[1] ?? ''}`
      : url;
  return { url: fixed.startsWith('data:') ? fixed : `data:${mime};base64,${url}`, size: blob.size };
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

  const msgsQ = useQuery({
    queryKey: ['me', 'messages'],
    queryFn: () => clientsApi.myMessages(80),
    refetchInterval: 5000,
    retry: 1,
  });
  const nutriQ = useQuery({
    queryKey: ['me', 'nutritionist'],
    queryFn: () => clientsApi.myNutritionist(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const sendMut = useMutation({
    mutationFn: clientsApi.sendMessage,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me', 'messages'] }),
    onError: (err: Error) => Alert.alert('Could not send', err.message),
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
    if (!content || sendMut.isPending) return;
    setText('');
    sendMut.mutate({ content });
  };

  const sendAttachment = async (uri: string, mime: string, name: string) => {
    setAttachBusy(true);
    try {
      const { url, size } = await uriToDataUrl(uri, mime);
      await sendMut.mutateAsync({
        content: text.trim() || undefined,
        attachment: { url, type: mime, name, size },
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
